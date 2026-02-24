/**
 * MD to Print — Main Application Entry Point
 *
 * Wires up the editor, preview, printer, and toolbar.
 */
import { createEditor, getEditorContent, setEditorContent } from "./editor.js";
import { renderPreview, setPaperSize, renderFallbackPreview } from "./preview.js";
import { refreshPrinters, getSelectedPrinter, printReceipt } from "./printer.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let editorView = null;
let currentFilePath = null;
let paperWidth = 80;
let isPythonReady = false;

// ---------------------------------------------------------------------------
// DOM References
// ---------------------------------------------------------------------------

const btnOpen = document.getElementById("btn-open");
const btnSave = document.getElementById("btn-save");
const btnPrint = document.getElementById("btn-print");
const btnRefreshPrinters = document.getElementById("btn-refresh-printers");
const fileNameLabel = document.getElementById("file-name");
const statusIndicator = document.getElementById("status-indicator");
const paperRadios = document.querySelectorAll('input[name="paperWidth"]');
const toastEl = document.getElementById("toast");

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

let toastTimer = null;

function showToast(message, type = "info", durationMs = 3000) {
  if (!toastEl) return;
  clearTimeout(toastTimer);
  // Truncate very long messages for the toast, but keep enough to be useful
  const displayMsg = message.length > 200 ? message.slice(0, 200) + "..." : message;
  toastEl.textContent = displayMsg;
  toastEl.className = `toast toast-${type} visible`;
  // Errors get longer display time
  const duration = type === "error" ? Math.max(durationMs, 8000) : durationMs;
  toastTimer = setTimeout(() => {
    toastEl.className = "toast hidden";
  }, duration);
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

function setStatus(state, text) {
  if (!statusIndicator) return;
  statusIndicator.className = `status ${state}`;
  statusIndicator.textContent = text;
}

// ---------------------------------------------------------------------------
// Preview: request Python to parse Markdown → receipt lines
// ---------------------------------------------------------------------------

let previewPending = false;
let previewQueued = null;

async function updatePreview(markdownText) {
  if (!markdownText || !markdownText.trim()) {
    renderPreview([]);
    return;
  }

  // If Python not ready yet, use fallback
  if (!isPythonReady) {
    renderFallbackPreview(markdownText);
    return;
  }

  // Debounce / coalesce rapid calls
  if (previewPending) {
    previewQueued = markdownText;
    return;
  }

  previewPending = true;

  try {
    const result = await window.api.parsePreview(markdownText, paperWidth);
    if (result && result.lines) {
      renderPreview(result.lines);
    } else if (result && result.error) {
      console.warn("Preview error:", result.error);
      renderFallbackPreview(markdownText);
    }
  } catch (err) {
    console.error("Preview failed:", err);
    renderFallbackPreview(markdownText);
  } finally {
    previewPending = false;
    if (previewQueued !== null) {
      const queued = previewQueued;
      previewQueued = null;
      updatePreview(queued);
    }
  }
}

// ---------------------------------------------------------------------------
// Paper width toggle
// ---------------------------------------------------------------------------

function handlePaperChange(width) {
  paperWidth = width;
  setPaperSize(width);
  // Re-render preview with new paper width
  if (editorView) {
    updatePreview(getEditorContent(editorView));
  }
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

async function openFile() {
  try {
    const result = await window.api.openFile();
    if (result.canceled) return;
    currentFilePath = result.filePath;
    setEditorContent(editorView, result.content);
    fileNameLabel.textContent = result.filePath.split(/[/\\]/).pop();
    showToast("File loaded", "success");
  } catch (err) {
    showToast(`Failed to open file: ${err.message}`, "error");
  }
}

async function saveFile() {
  try {
    const content = getEditorContent(editorView);
    const result = await window.api.saveFile(content, currentFilePath);
    if (result.canceled) return;
    currentFilePath = result.filePath;
    fileNameLabel.textContent = result.filePath.split(/[/\\]/).pop();
    showToast("File saved", "success");
  } catch (err) {
    showToast(`Failed to save: ${err.message}`, "error");
  }
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

async function handlePrint() {
  const markdown = getEditorContent(editorView);
  if (!markdown.trim()) {
    showToast("Nothing to print", "info");
    return;
  }

  const printer = getSelectedPrinter();
  if (!printer) {
    showToast("Please select a printer first", "error");
    return;
  }

  setStatus("printing", "Printing...");
  btnPrint.disabled = true;

  try {
    const result = await printReceipt(markdown, paperWidth);
    if (result.success) {
      setStatus("success", "Printed!");
      showToast("Receipt printed successfully!", "success");
      setTimeout(() => setStatus("idle", "Ready"), 3000);
    } else {
      setStatus("error", "Failed");
      showToast(`Print failed: ${result.error || "Unknown error"}`, "error");
      setTimeout(() => setStatus("idle", "Ready"), 5000);
    }
  } catch (err) {
    setStatus("error", "Error");
    showToast(`Print error: ${err.message}`, "error");
    setTimeout(() => setStatus("idle", "Ready"), 5000);
  } finally {
    btnPrint.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Pane Resizer
// ---------------------------------------------------------------------------

function initResizer() {
  const resizer = document.getElementById("pane-resizer");
  const editorPane = document.getElementById("editor-pane");
  const previewPane = document.getElementById("preview-pane");
  if (!resizer || !editorPane || !previewPane) return;

  let startX = 0;
  let startEditorWidth = 0;

  function onMouseDown(e) {
    startX = e.clientX;
    startEditorWidth = editorPane.offsetWidth;
    resizer.classList.add("active");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  }

  function onMouseMove(e) {
    const dx = e.clientX - startX;
    const newWidth = Math.max(300, startEditorWidth + dx);
    const totalWidth = editorPane.parentElement.offsetWidth - resizer.offsetWidth;
    const clampedWidth = Math.min(newWidth, totalWidth - 280);

    editorPane.style.flex = "none";
    editorPane.style.width = clampedWidth + "px";
    previewPane.style.flex = "1";
  }

  function onMouseUp() {
    resizer.classList.remove("active");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  resizer.addEventListener("mousedown", onMouseDown);
}

// ---------------------------------------------------------------------------
// Keyboard Shortcuts
// ---------------------------------------------------------------------------

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Ctrl+O → Open
    if (e.ctrlKey && e.key === "o") {
      e.preventDefault();
      openFile();
    }
    // Ctrl+S → Save
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      saveFile();
    }
    // Ctrl+P → Print
    if (e.ctrlKey && e.key === "p") {
      e.preventDefault();
      handlePrint();
    }
  });
}

// ---------------------------------------------------------------------------
// Sample content
// ---------------------------------------------------------------------------

const SAMPLE_MARKDOWN = `# My Store Name

## Receipt

---

**Date:** 2026-02-16
**Receipt #:** 0001

---

| Item          | Qty | Price  |
|---------------|-----|--------|
| Widget A      | 2   | $10.00 |
| Widget B      | 1   | $25.00 |
| Service Fee   | 1   | $5.00  |

---

**Subtotal:** $40.00
**Tax (10%):** $4.00

### Total: $44.00

---

Payment: Cash
Change: $6.00

Thank you for your purchase!

---

[QR:https://example.com/receipt/0001]
`;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init() {
  // Initialize the CodeMirror editor
  const container = document.getElementById("editor-container");
  editorView = createEditor(container, SAMPLE_MARKDOWN, (content) => {
    updatePreview(content);
  });

  // Set initial paper size
  setPaperSize(paperWidth);

  // Show fallback preview immediately
  renderFallbackPreview(SAMPLE_MARKDOWN);

  // Wire up toolbar buttons
  if (btnOpen) btnOpen.addEventListener("click", openFile);
  if (btnSave) btnSave.addEventListener("click", saveFile);
  if (btnPrint) btnPrint.addEventListener("click", handlePrint);
  if (btnRefreshPrinters) btnRefreshPrinters.addEventListener("click", refreshPrinters);

  // Paper width radios
  for (const radio of paperRadios) {
    radio.addEventListener("change", () => {
      handlePaperChange(parseInt(radio.value, 10));
    });
  }

  // Pane resizer
  initResizer();

  // Keyboard shortcuts
  initKeyboardShortcuts();

  // Load printers asynchronously
  refreshPrinters();

  // Try to talk to Python — mark ready if it responds
  try {
    const result = await window.api.parsePreview("# Test", 80);
    if (result && result.lines) {
      isPythonReady = true;
      // Re-render with proper Python parsing
      updatePreview(SAMPLE_MARKDOWN);
    }
  } catch (e) {
    console.warn("Python backend not ready yet, using fallback preview");
    // Retry after a short delay (Python may still be starting up)
    setTimeout(async () => {
      try {
        const result = await window.api.parsePreview("# Test", 80);
        if (result && result.lines) {
          isPythonReady = true;
          updatePreview(getEditorContent(editorView));
        }
      } catch (e2) {
        console.warn("Python backend still not available:", e2.message);
      }
    }, 3000);
  }
}

// Start the app
init();
