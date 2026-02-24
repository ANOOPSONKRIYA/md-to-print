/**
 * MD to Print — Preload Script
 *
 * Exposes a safe API to the renderer via contextBridge.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  /**
   * List all installed Windows printers.
   * @returns {Promise<{printers: Array<{name: string, isDefault: boolean}>, error?: string}>}
   */
  listPrinters: () => ipcRenderer.invoke("list-printers"),

  /**
   * Parse Markdown and return receipt preview lines.
   * @param {string} markdown
   * @param {number} paperWidth - 80 or 58
   * @returns {Promise<{lines: Array, error?: string}>}
   */
  parsePreview: (markdown, paperWidth) =>
    ipcRenderer.invoke("parse-preview", markdown, paperWidth),

  /**
   * Print a Markdown receipt to the selected printer.
   * @param {object} options
   * @param {string} options.markdown
   * @param {string} options.printerName
   * @param {number} options.paperWidth
   * @param {boolean} [options.cutAfter=true]
   * @param {number} [options.fontScale=1]
   * @param {number} [options.topMargin=0]
   * @param {number} [options.bottomMargin=3]
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  printReceipt: (options) => ipcRenderer.invoke("print-receipt", options),

  /**
   * Print an image to the printer.
   * @param {string} imagePath
   * @param {string} printerName
   * @param {string} [align="center"]
   */
  printImage: (imagePath, printerName, align) =>
    ipcRenderer.invoke("print-image", imagePath, printerName, align),

  /**
   * Print a QR code to the printer.
   * @param {string} content
   * @param {string} printerName
   * @param {number} [size=4]
   */
  printQR: (content, printerName, size) =>
    ipcRenderer.invoke("print-qr", content, printerName, size),

  /**
   * Open a file dialog and load an .md file.
   * @returns {Promise<{canceled: boolean, filePath?: string, content?: string}>}
   */
  openFile: () => ipcRenderer.invoke("open-file"),

  /**
   * Save content to an .md file.
   * @param {string} content
   * @param {string} [filePath] - If null, shows save dialog.
   * @returns {Promise<{canceled: boolean, filePath?: string}>}
   */
  saveFile: (content, filePath) =>
    ipcRenderer.invoke("save-file", content, filePath),
});
