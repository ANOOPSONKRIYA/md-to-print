/**
 * MD to Print — Printer Module
 *
 * Handles printer listing, selection, printing via the preload API.
 */

const printerSelect = document.getElementById("printer-select");
const STORAGE_KEY = "mdtoprint_last_printer";

/**
 * Populate the printer dropdown from the Python backend.
 */
export async function refreshPrinters() {
  if (!printerSelect) return;

  printerSelect.innerHTML = '<option value="">Loading...</option>';
  printerSelect.disabled = true;

  try {
    const result = await window.api.listPrinters();

    if (result.error) {
      printerSelect.innerHTML = `<option value="">Error: ${result.error}</option>`;
      return;
    }

    const printers = result.printers || [];

    if (printers.length === 0) {
      printerSelect.innerHTML = '<option value="">No printers found</option>';
      return;
    }

    printerSelect.innerHTML = "";

    // "Select printer" placeholder
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- Select Printer --";
    printerSelect.appendChild(placeholder);

    // Populate printers
    const lastPrinter = localStorage.getItem(STORAGE_KEY);
    let hasSelected = false;

    for (const printer of printers) {
      const opt = document.createElement("option");
      opt.value = printer.name;
      opt.textContent = printer.name + (printer.isDefault ? " (Default)" : "");

      // Auto-select last used printer, or the default
      if (!hasSelected && (printer.name === lastPrinter || (printer.isDefault && !lastPrinter))) {
        opt.selected = true;
        hasSelected = true;
      }

      printerSelect.appendChild(opt);
    }
  } catch (err) {
    printerSelect.innerHTML = `<option value="">Error loading printers</option>`;
    console.error("Failed to load printers:", err);
  } finally {
    printerSelect.disabled = false;
  }
}

/**
 * Get the currently selected printer name.
 * @returns {string}
 */
export function getSelectedPrinter() {
  if (!printerSelect) return "";
  const name = printerSelect.value;
  if (name) localStorage.setItem(STORAGE_KEY, name);
  return name;
}

/**
 * Print the receipt.
 * @param {string} markdown - The Markdown content
 * @param {number} paperWidth - 80 or 58
 * @param {object} [options] - Additional print options
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function printReceipt(markdown, paperWidth, options = {}) {
  const printerName = getSelectedPrinter();
  if (!printerName) {
    return { success: false, error: "No printer selected" };
  }

  return window.api.printReceipt({
    markdown,
    printerName,
    paperWidth,
    cutAfter: options.cutAfter !== false,
    fontScale: options.fontScale || 1,
    topMargin: options.topMargin || 0,
    bottomMargin: options.bottomMargin || 3,
  });
}
