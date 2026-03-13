# MD to Print

Markdown to thermal receipt printer for Windows.

This project is an Electron + Python desktop app that converts Markdown into receipt-formatted ESC/POS output and prints directly to installed Windows printers in RAW mode.

## What You Get

- Markdown editor with live receipt preview
- Paper width toggle: 80mm (48 chars) and 58mm (32 chars)
- Direct printing (no browser print dialog, no PDF)
- Windows printer discovery and quick selection
- Built-in keyboard shortcuts: Ctrl+O, Ctrl+S, Ctrl+P
- QR embedding from Markdown using [QR:content]
- Automatic cut command after printing

## Requirements

- Windows 10 or 11
- Node.js 18+
- Python 3.10+
- Any ESC/POS-compatible thermal printer (TVS RP3230 tested)

## Quick Start (Development)

```powershell
cd "d:\Github\md to print"
npm install

cd python-backend
pip install -r requirements.txt
cd ..

npm run build:renderer
npm run dev
```

Notes:

- In development mode, Electron starts the backend using the python command.
- Ensure python is available on PATH, or use a shell where your Python environment is already activated.

## Build Installer

Build the packaged backend and Windows installer:

```powershell
cd "d:\Github\md to print"
npm run dist:full
```

This runs:

1. Renderer bundle build via esbuild
2. Python backend packaging via PyInstaller
3. Electron packaging via electron-builder

Expected output:

- release/MD to Print-Setup-1.0.0.exe

## Supported Markdown

| Markdown | Receipt Behavior |
|---|---|
| # Heading | Centered, bold, large |
| ## Heading | Centered, bold, double-height |
| ### Heading | Centered, bold |
| **bold** | Bold text |
| --- | Full-width divider |
| - item / * item | Bullet list |
| 1. item | Numbered list |
| > quote | Prefixed quote block |
| Tables | Fixed-width aligned columns |
| [QR:https://example.com] | QR block |

Formatting constraints:

- 80mm mode wraps at 48 characters per line
- 58mm mode wraps at 32 characters per line
- Emoji and unsupported Unicode are stripped before printing
- Consecutive blank lines are collapsed by the parser

## Architecture

```text
Renderer (CodeMirror + preview UI)
   |
   | Electron IPC (invoke)
   v
Main process (spawns backend.py or bundled backend.exe)
   |
   | stdin/stdout JSON lines
   v
Python backend
  - md_parser.py
  - escpos_printer.py
  - printer_manager.py
   |
   | win32print RAW
   v
Thermal printer
```

### Backend Commands (JSON-line IPC)

- list_printers
- parse_preview
- print
- print_image
- print_qr

## Printer Setup (Windows)

1. Install your printer driver from vendor support.
2. If needed, use Generic / Text Only driver.
3. Confirm the printer appears in Windows Settings > Printers & Scanners.
4. Open the app, refresh printers, select printer, then print a test receipt.

## Scripts

| Script | Purpose |
|---|---|
| npm run dev | Start Electron app in dev mode |
| npm run build:renderer | Build renderer bundle |
| npm run build:python | Package Python backend |
| npm run dist | Build renderer and package app |
| npm run dist:full | Build renderer + backend + package app |

## Troubleshooting

### No printers found

- Confirm USB/power connection.
- Check Windows printer installation first.
- Use the refresh button in the app.

### Python backend does not start in dev

- Verify python resolves in terminal (python --version).
- Reinstall Python deps:

```powershell
cd python-backend
pip install -r requirements.txt
```

### Printer error about deleted printer or error 1905

This usually means the printer port mapping is wrong.

1. Open Windows printer properties.
2. Go to Ports.
3. Select the correct USB port (commonly USB001 or USB002).
4. Retry printing.

### Garbled or cut output

- Confirm ESC/POS compatibility.
- Match paper size in app with actual paper roll width.
- Try Generic / Text Only driver if vendor driver behaves unexpectedly.

## Known Notes

- Preview starts in a lightweight fallback mode until the Python backend responds.
- Image and direct QR print commands exist in the backend API, even though the main UI flow centers on Markdown receipt printing.

## Project Layout

```text
src/main/           Electron main process and preload bridge
src/renderer/       UI, editor, preview, print wiring
python-backend/     Markdown parser, ESC/POS builder, printer manager
```

## License

MIT
