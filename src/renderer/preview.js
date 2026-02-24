/**
 * MD to Print — Preview Module
 *
 * Renders parsed receipt lines into the preview panel, simulating
 * how the receipt will look on thermal paper.
 */

const previewContent = document.getElementById("receipt-content");
const receiptPreview = document.getElementById("receipt-preview");
const paperLabel = document.getElementById("preview-paper-label");

/**
 * Update the receipt preview from an array of parsed lines.
 * @param {Array<{text: string, bold: boolean, align: string, type: string, doubleHeight: boolean, doubleWidth: boolean, underline: boolean}>} lines
 */
export function renderPreview(lines) {
  if (!previewContent) return;

  // Clear existing content
  previewContent.innerHTML = "";

  if (!lines || lines.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "receipt-line center";
    placeholder.style.color = "#999";
    placeholder.style.fontStyle = "italic";
    placeholder.textContent = "Start typing Markdown to see the receipt preview...";
    previewContent.appendChild(placeholder);
    return;
  }

  for (const line of lines) {
    const el = document.createElement("div");
    el.className = "receipt-line";

    // Add style classes
    if (line.bold) el.classList.add("bold");
    if (line.align === "center") el.classList.add("center");
    if (line.align === "right") el.classList.add("right");
    if (line.doubleHeight || line.double_height) el.classList.add("double-height");
    if (line.doubleWidth || line.double_width) el.classList.add("double-width");
    if (line.underline) el.classList.add("underline");

    switch (line.type) {
      case "divider":
        el.classList.add("divider");
        el.textContent = line.text;
        break;

      case "blank":
        el.classList.add("blank");
        break;

      case "qr":
        el.classList.add("qr");
        el.textContent = `[QR: ${line.text}]`;
        break;

      case "image":
        el.classList.add("qr"); // similar style
        el.textContent = `[Image: ${line.text}]`;
        break;

      default:
        el.textContent = line.text;
        break;
    }

    previewContent.appendChild(el);
  }
}

/**
 * Switch the preview paper size.
 * @param {number} width - 80 or 58
 */
export function setPaperSize(width) {
  if (!receiptPreview) return;

  if (width === 58) {
    receiptPreview.classList.add("paper-58");
    if (paperLabel) paperLabel.textContent = "58mm · 32 chars";
  } else {
    receiptPreview.classList.remove("paper-58");
    if (paperLabel) paperLabel.textContent = "80mm · 48 chars";
  }
}

/**
 * Show a quick fallback preview from raw Markdown (used before Python parses it).
 * @param {string} markdownText
 */
export function renderFallbackPreview(markdownText) {
  if (!previewContent) return;
  previewContent.innerHTML = "";

  const lines = markdownText.split("\n");
  for (const line of lines) {
    const el = document.createElement("div");
    el.className = "receipt-line";

    if (line.startsWith("# ")) {
      el.classList.add("bold", "center", "double-height");
      el.textContent = line.replace(/^#+\s*/, "");
    } else if (line.startsWith("## ")) {
      el.classList.add("bold", "center");
      el.textContent = line.replace(/^#+\s*/, "");
    } else if (line.match(/^---+$/)) {
      el.classList.add("divider", "center");
      el.textContent = "-".repeat(48);
    } else if (line.trim() === "") {
      el.classList.add("blank");
    } else {
      el.textContent = line.replace(/\*\*(.*?)\*\*/g, "$1");
    }

    previewContent.appendChild(el);
  }
}
