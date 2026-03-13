# MD to Print

**Markdown to Thermal Receipt Printer (TVS RP3230) — Windows Desktop App**

A lightweight Electron + Python desktop application that converts Markdown (.md) files into properly formatted receipts and prints them directly to a 3-inch thermal receipt printer using ESC/POS commands. No browser print dialog, no PDF conversion — raw ESC/POS bytes go straight to the printer.

---

## Features

- **Markdown Editor** — CodeMirror 6 with syntax highlighting, Markdown-specific keybindings
- **Live Receipt Preview** — Simulated 80mm/58mm receipt paper in real-time
- **Direct Thermal Printing** — ESC/POS commands via `python-escpos` Win32Raw
- **Printer Detection** — Auto-detects all installed Windows printers
- **Paper Size Toggle** — Switch between 80mm (48 chars) and 58mm (32 chars)
- **Word Wrapping** — Auto-wraps text to fit receipt width perfectly
- **Formatting Support** — Headings (centered + bold), `**bold**`, `---` dividers, lists, tables, blockquotes
- **Auto-Cutter** — Triggers the TVS RP3230 auto-cutter after each print
- **QR Code Printing** — Embed `[QR:content]` in Markdown to print QR codes
- **Image Printing** — Logo/image support (auto-scaled to receipt width)
- **Keyboard Shortcuts** — `Ctrl+O` open, `Ctrl+S` save, `Ctrl+P` print
- **Offline** — Works entirely offline, no internet needed
- **Templates** — Load/save `.md` receipt templates

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Electron App                        │
│  ┌──────────────────┐   ┌──────────────────────────┐ │
│  │   Main Process    │   │    Renderer Process       │ │
│  │   (main.js)       │   │    (HTML + CSS + JS)      │ │
│  │                    │   │                           │ │
│  │  ⇄ IPC (invoke)  │   │  CodeMirror 6 Editor      │ │
│  │  ⇄ Child Process  │   │  Receipt Preview Panel    │ │
│  │                    │   │  Printer Controls         │ │
│  └────────┬───────────┘   └───────────────────────────┘ │
│           │ stdin/stdout JSON-line protocol              │
│  ┌────────▼───────────┐                                  │
│  │   Python Backend    │                                  │
│  │   (backend.exe)     │                                  │
│  │                     │                                  │
│  │  md_parser.py       │  Markdown → ReceiptLine AST     │
│  │  escpos_printer.py  │  ReceiptLine → ESC/POS bytes    │
│  │  printer_manager.py │  Win32 printer enumeration      │
│  └──────────┬──────────┘                                  │
│             │ win32print (RAW mode)                       │
└─────────────┼────────────────────────────────────────────┘
              │
     ┌────────▼────────┐
     │  TVS RP3230      │
     │  Thermal Printer  │
     └──────────────────┘
```

---

## Prerequisites

- **Node.js** ≥ 18 (includes npm)
- **Python** ≥ 3.10
- **Windows** 10 or 11
- **TVS RP3230** (or any ESC/POS-compatible thermal printer) with driver installed

---

## Quick Start

### 1. Clone and install Node.js dependencies

```bash
cd "d:\Github\md to print"
npm install
```

### 2. Install Python dependencies

```bash
cd python-backend
pip install -r requirements.txt
cd ..
```

### 3. Build the renderer bundle

```bash
npm run build:renderer
```

### 4. Run in development mode

```bash
npm run dev
```

The app will open with a sample receipt in the editor. The Python backend starts automatically.

---

## Printer Setup (TVS RP3230)

### Step 1: Install the printer driver

1. Download the TVS RP3230 driver from the [TVS Electronics support page](https://tvs-e.in/support/)
2. Install the driver and connect the printer via USB
3. Alternatively, use the **"Generic / Text Only"** driver:
   - Open **Settings → Printers & Scanners → Add a printer**
   - Select **"The printer that I want isn't listed"**
   - Choose **"Add a local printer"** → select the USB port
   - Choose manufacturer **"Generic"** → model **"Generic / Text Only"**

### Step 2: Verify the printer is detected

1. Open **Windows Settings → Printers & Scanners**
2. Note the exact printer name (e.g., `"TVS RP 3230"`)
3. In the app, click the refresh button next to the printer dropdown
4. Select your printer from the list

### Step 3: Test print

1. Type or load Markdown content in the editor
2. Click the **Print** button (or press `Ctrl+P`)
3. The receipt should print with proper formatting and the auto-cutter should fire

---

## Markdown Formatting Reference

| Markdown Syntax            | Receipt Output                    |
|----------------------------|-----------------------------------|
| `# Heading 1`             | Center + Bold + Double size       |
| `## Heading 2`            | Center + Bold + Double height     |
| `### Heading 3`           | Center + Bold                     |
| `**bold text**`           | Bold text                         |
| `---`                     | Full-width divider line           |
| `- item` / `* item`       | Bulleted list with `* ` prefix    |
| `1. item`                 | Numbered list                     |
| `` `code` ``              | Inline code (fixed-width)         |
| `> quote`                 | Blockquote with `\| ` prefix      |
| Tables                    | Fixed-width aligned columns       |
| `[QR:https://example.com]`| QR code printed on receipt        |

**Constraints:**
- 80mm paper → 48 characters per line (Font A, 12×24)
- 58mm paper → 32 characters per line
- Emojis and unsupported unicode are automatically stripped
- Long lines are word-wrapped to fit receipt width

---

## Build for Distribution

### Build the Python backend (one-time)

```bash
cd python-backend
build.bat
cd ..
```

This creates `python-backend/dist/md-to-print-backend/` with a standalone `.exe`.

### Build the Windows installer

```bash
npm run dist:full
```

This runs:
1. `esbuild` → bundles renderer JS
2. `electron-builder` → packages the Electron app + Python backend into an NSIS installer

Output: `release/MD to Print-Setup-1.0.0.exe`

---

## Folder Structure

```
md-to-print/
├── package.json              # Node.js project config
├── electron-builder.yml      # Electron packaging config
├── esbuild.config.js         # Renderer JS bundler config
├── src/
│   ├── main/
│   │   ├── main.js           # Electron main process
│   │   └── preload.js        # Context bridge (renderer ↔ main IPC)
│   ├── renderer/
│   │   ├── index.html        # App shell
│   │   ├── styles.css        # UI styles (Catppuccin Mocha theme)
│   │   ├── app.js            # Main renderer entry point
│   │   ├── editor.js         # CodeMirror 6 setup
│   │   ├── preview.js        # Receipt preview rendering
│   │   ├── printer.js        # Printer listing & print logic
│   │   └── dist/
│   │       └── bundle.js     # Built by esbuild (gitignored)
│   └── assets/
│       └── icon.ico          # App icon (add your own)
├── python-backend/
│   ├── backend.py            # IPC entry point (stdin/stdout JSON)
│   ├── md_parser.py          # Markdown → ReceiptLine[] converter
│   ├── escpos_printer.py     # ReceiptLine[] → ESC/POS bytes → printer
│   ├── printer_manager.py    # Windows printer enumeration
│   ├── requirements.txt      # Python dependencies
│   └── build.bat             # PyInstaller build script
└── README.md
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the app in development mode |
| `npm run build:renderer` | Bundle renderer JS via esbuild |
| `npm run build:python` | Build Python backend to .exe (PyInstaller) |
| `npm run dist` | Build renderer + Electron installer (no Python rebuild) |
| `npm run dist:full` | Build renderer + Python + Electron installer |

---

## Troubleshooting

### "No printers found"
- Ensure the printer is physically connected and powered on
- Check **Windows Settings → Printers & Scanners** — the printer should appear
- Click the refresh button in the app

### "Python backend not running"
- In dev mode, ensure `python` is on your PATH and `pip install -r python-backend/requirements.txt` was run
- Check the DevTools console (`F12`) for Python stderr output
- Try running `python python-backend/backend.py` directly and type `{"action": "list_printers"}` + Enter

### Print output is garbled
- The printer may not be ESC/POS-compatible — verify with the printer manual
- Try using the **"Generic / Text Only"** Windows driver instead of the manufacturer driver
- Ensure the printer's paper width setting matches the app's paper width toggle

### Characters are cut off
- Switch to 80mm mode if using 80mm paper (or 58mm if using 58mm paper)
- The app auto-wraps at 48 chars (80mm) or 32 chars (58mm)

---

## License

MIT
