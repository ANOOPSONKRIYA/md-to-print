/**
 * MD to Print — Electron Main Process
 *
 * Spawns the Python backend as a child process, manages IPC between
 * the renderer and Python, and handles file dialogs.
 */
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const readline = require("readline");

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

let mainWindow = null;
let pythonProcess = null;
let requestId = 0;
const pendingRequests = new Map(); // id → { resolve, reject, timer }

// ---------------------------------------------------------------------------
// Python Backend Management
// ---------------------------------------------------------------------------

function getPythonBackendPath() {
  if (app.isPackaged) {
    // Production: bundled via extraResources
    return path.join(process.resourcesPath, "python-backend", "md-to-print-backend.exe");
  }
  // Development: run python script directly
  return null; // handled by spawn logic below
}

function startPythonBackend() {
  const exePath = getPythonBackendPath();

  if (exePath && fs.existsSync(exePath)) {
    // Production mode — run bundled exe
    pythonProcess = spawn(exePath, [], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } else {
    // Development mode — run via python interpreter
    const backendScript = path.join(__dirname, "..", "..", "python-backend", "backend.py");
    pythonProcess = spawn("python", [backendScript], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  }

  // Read stdout line by line for JSON-line protocol
  const rl = readline.createInterface({ input: pythonProcess.stdout });
  rl.on("line", (line) => {
    try {
      const data = JSON.parse(line);
      if (data.id !== undefined && pendingRequests.has(data.id)) {
        const { resolve, timer } = pendingRequests.get(data.id);
        clearTimeout(timer);
        pendingRequests.delete(data.id);
        resolve(data);
      }
      // Status messages (e.g. {status: "ready"}) are ignored silently
    } catch (err) {
      console.error("[Python stdout parse error]", err.message, "line:", line);
    }
  });

  // Capture stderr for debugging
  pythonProcess.stderr.on("data", (chunk) => {
    console.error("[Python stderr]", chunk.toString());
  });

  pythonProcess.on("exit", (code, signal) => {
    console.warn(`[Python] exited code=${code} signal=${signal}`);
    // Reject all pending requests
    for (const [id, { reject, timer }] of pendingRequests) {
      clearTimeout(timer);
      reject(new Error("Python backend exited unexpectedly"));
    }
    pendingRequests.clear();

    // Auto-restart after 2s (unless app is quitting)
    if (!app.isQuitting) {
      setTimeout(() => {
        console.log("[Python] Restarting backend...");
        startPythonBackend();
      }, 2000);
    }
  });

  pythonProcess.on("error", (err) => {
    console.error("[Python spawn error]", err);
  });
}

/**
 * Send a JSON command to the Python backend and return a promise for the response.
 */
function sendToPython(command) {
  return new Promise((resolve, reject) => {
    if (!pythonProcess || pythonProcess.killed) {
      return reject(new Error("Python backend is not running"));
    }

    const id = ++requestId;
    command.id = id;

    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("Python backend timeout (30s)"));
    }, 30000);

    pendingRequests.set(id, { resolve, reject, timer });

    const jsonLine = JSON.stringify(command) + "\n";
    pythonProcess.stdin.write(jsonLine, "utf8");
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "MD to Print",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Open DevTools in dev mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

ipcMain.handle("list-printers", async () => {
  try {
    return await sendToPython({ action: "list_printers" });
  } catch (err) {
    return { printers: [], error: err.message };
  }
});

ipcMain.handle("parse-preview", async (_event, markdown, paperWidth) => {
  try {
    return await sendToPython({
      action: "parse_preview",
      markdown,
      paperWidth,
    });
  } catch (err) {
    return { lines: [], error: err.message };
  }
});

ipcMain.handle("print-receipt", async (_event, options) => {
  try {
    return await sendToPython({
      action: "print",
      markdown: options.markdown,
      printerName: options.printerName,
      paperWidth: options.paperWidth,
      cutAfter: options.cutAfter !== false,
      fontScale: options.fontScale || 1,
      topMargin: options.topMargin || 0,
      bottomMargin: options.bottomMargin || 3,
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("print-image", async (_event, imagePath, printerName, align) => {
  try {
    return await sendToPython({
      action: "print_image",
      imagePath,
      printerName,
      align: align || "center",
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("print-qr", async (_event, content, printerName, size) => {
  try {
    return await sendToPython({
      action: "print_qr",
      content,
      printerName,
      size: size || 4,
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("open-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Markdown File",
    filters: [
      { name: "Markdown Files", extensions: ["md", "markdown", "txt"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, "utf8");
  return { canceled: false, filePath, content };
});

ipcMain.handle("save-file", async (_event, content, filePath) => {
  if (!filePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save Markdown File",
      filters: [{ name: "Markdown Files", extensions: ["md"] }],
      defaultPath: "receipt.md",
    });
    if (result.canceled) return { canceled: true };
    filePath = result.filePath;
  }

  fs.writeFileSync(filePath, content, "utf8");
  return { canceled: false, filePath };
});

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  startPythonBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  app.isQuitting = true;
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill();
  }
  app.quit();
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
