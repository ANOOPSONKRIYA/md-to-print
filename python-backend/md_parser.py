"""
Markdown → Receipt Lines parser.

Uses mistune 3.x to produce a nested AST, then walks it to emit
a flat list of ReceiptLine objects suitable for ESC/POS rendering.
"""
from __future__ import annotations

import re
import textwrap
from dataclasses import dataclass, field, asdict
from typing import List, Optional

import mistune

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class ReceiptLine:
    """One logical line / instruction for the receipt printer."""
    text: str = ""
    bold: bool = False
    align: str = "left"           # left | center | right
    double_height: bool = False
    double_width: bool = False
    type: str = "text"            # text | divider | blank | image | qr
    underline: bool = False


def receipt_lines_to_dicts(lines: List[ReceiptLine]) -> List[dict]:
    """Serialize a list of ReceiptLine to plain dicts (JSON-safe)."""
    return [asdict(l) for l in lines]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "\U0001f926-\U0001f937"
    "\U00010000-\U0010ffff"
    "\u2600-\u26FF"
    "\u2700-\u27BF"
    "\u200d"
    "\ufe0f"
    "]+",
    flags=re.UNICODE,
)

# QR custom syntax: [QR:content] or [qr:content]
_QR_RE = re.compile(r"\[QR:(.+?)\]", re.IGNORECASE)


def _strip_unsupported(text: str) -> str:
    """Remove emojis and non-ASCII-printable characters."""
    text = _EMOJI_RE.sub("", text)
    # Keep basic printable ASCII + common currency symbols
    cleaned = []
    for ch in text:
        code = ord(ch)
        if 0x20 <= code <= 0x7E:            # basic ASCII printable
            cleaned.append(ch)
        elif ch in "₹€£¥©®™°±×÷":          # common useful symbols
            cleaned.append(ch)
        elif ch in "\n\r\t":
            cleaned.append(ch)
    return "".join(cleaned)


def _wrap(text: str, width: int) -> List[str]:
    """Word-wrap text to *width* columns, preserving intentional newlines."""
    result = []
    for paragraph in text.split("\n"):
        if not paragraph.strip():
            result.append("")
        else:
            wrapped = textwrap.fill(paragraph, width=width, break_long_words=True, break_on_hyphens=True)
            result.extend(wrapped.split("\n"))
    return result


# ---------------------------------------------------------------------------
# AST walker
# ---------------------------------------------------------------------------

class _ASTWalker:
    """Walk mistune 3.x AST (list-of-dicts) and produce ReceiptLine objects."""

    def __init__(self, chars_per_line: int = 48):
        self.cpl = chars_per_line
        self.lines: List[ReceiptLine] = []

    # -- public --------------------------------------------------------

    def walk(self, ast_nodes: list) -> List[ReceiptLine]:
        for node in ast_nodes:
            self._visit(node)
        return self.lines

    # -- dispatch ------------------------------------------------------

    def _visit(self, node: dict):
        ntype = node.get("type", "")
        handler = getattr(self, f"_visit_{ntype}", None)
        if handler:
            handler(node)
        else:
            # Fallback: if it has children, visit them
            children = node.get("children")
            if children:
                for child in children:
                    if isinstance(child, dict):
                        self._visit(child)

    # -- block-level nodes ---------------------------------------------

    def _visit_heading(self, node: dict):
        level = node.get("attrs", {}).get("level", 1) if "attrs" in node else node.get("level", 1)
        text = self._extract_text(node)
        text = _strip_unsupported(text)

        if level <= 2:
            for wrapped in _wrap(text, self.cpl):
                self.lines.append(ReceiptLine(
                    text=wrapped,
                    bold=True,
                    align="center",
                    double_height=True,
                    double_width=(level == 1),
                    type="text",
                ))
        else:
            for wrapped in _wrap(text, self.cpl):
                self.lines.append(ReceiptLine(
                    text=wrapped,
                    bold=True,
                    align="center",
                    type="text",
                ))
        self.lines.append(ReceiptLine(type="blank"))

    def _visit_paragraph(self, node: dict):
        text = self._extract_text(node)
        text = _strip_unsupported(text)

        # Check for QR code custom syntax
        qr_match = _QR_RE.search(text)
        if qr_match:
            qr_content = qr_match.group(1)
            # Text before QR
            before = text[:qr_match.start()].strip()
            if before:
                for w in _wrap(before, self.cpl):
                    self.lines.append(ReceiptLine(text=w))
            self.lines.append(ReceiptLine(text=qr_content, type="qr", align="center"))
            # Text after QR
            after = text[qr_match.end():].strip()
            if after:
                for w in _wrap(after, self.cpl):
                    self.lines.append(ReceiptLine(text=w))
            return

        # Detect inline bold — if the entire paragraph is strong, mark bold
        bold = self._is_all_bold(node)

        for wrapped in _wrap(text, self.cpl):
            self.lines.append(ReceiptLine(text=wrapped, bold=bold))
        self.lines.append(ReceiptLine(type="blank"))

    def _visit_thematic_break(self, node: dict):
        self.lines.append(ReceiptLine(
            text="-" * self.cpl,
            type="divider",
            align="center",
        ))

    def _visit_block_code(self, node: dict):
        raw = node.get("raw", node.get("text", ""))
        raw = _strip_unsupported(raw)
        for line in raw.split("\n"):
            truncated = line[:self.cpl]
            self.lines.append(ReceiptLine(text=truncated))
        self.lines.append(ReceiptLine(type="blank"))

    def _visit_block_quote(self, node: dict):
        children = node.get("children", [])
        # Collect inner text, prefix each line with "| "
        inner_walker = _ASTWalker(self.cpl - 2)
        inner_lines = inner_walker.walk(children)
        for rl in inner_lines:
            if rl.type == "blank":
                self.lines.append(rl)
            else:
                rl.text = "| " + rl.text
                self.lines.append(rl)

    def _visit_list(self, node: dict):
        children = node.get("children", [])
        ordered = node.get("ordered", False) if "ordered" in node else False
        # Also check attrs
        if "attrs" in node and isinstance(node["attrs"], dict):
            ordered = node["attrs"].get("ordered", ordered)

        for idx, item in enumerate(children):
            prefix = f"{idx + 1}. " if ordered else "* "
            self._visit_list_item(item, prefix)
        self.lines.append(ReceiptLine(type="blank"))

    def _visit_list_item(self, node: dict, prefix: str = "* "):
        text = self._extract_text(node)
        text = _strip_unsupported(text)
        indent = " " * len(prefix)
        wrapped = _wrap(text, self.cpl - len(prefix))
        for i, line in enumerate(wrapped):
            if i == 0:
                self.lines.append(ReceiptLine(text=prefix + line))
            else:
                self.lines.append(ReceiptLine(text=indent + line))

    def _visit_table(self, node: dict):
        """Render a Markdown table as fixed-width aligned columns for receipt."""
        rows = self._extract_table_rows(node)
        if not rows:
            return

        num_cols = max(len(row) for row in rows)

        # Normalize: pad every row to the same column count
        for row in rows:
            while len(row) < num_cols:
                row.append("")

        # Natural column widths (max cell content in each column)
        col_widths = [0] * num_cols
        for row in rows:
            for ci, cell in enumerate(row):
                col_widths[ci] = max(col_widths[ci], len(cell))

        # Detect "numeric-like" columns (right-align candidates)
        # A column is numeric if majority of data cells (non-header) look numeric
        is_numeric = [False] * num_cols
        if len(rows) > 1:
            for ci in range(num_cols):
                numeric_count = 0
                data_count = 0
                for row in rows[1:]:
                    val = row[ci].strip()
                    if val:
                        data_count += 1
                        cleaned = val.replace("$", "").replace("₹", "").replace("€", "").replace("£", "")
                        cleaned = cleaned.replace(",", "").replace(".", "").replace("-", "").strip()
                        if cleaned.isdigit() or cleaned == "":
                            numeric_count += 1
                if data_count > 0 and numeric_count >= data_count * 0.5:
                    is_numeric[ci] = True

        # Budget available characters: total - gaps between columns
        gap = 1  # single space between columns
        separator_space = gap * (num_cols - 1)
        available = self.cpl - separator_space

        total_natural = sum(col_widths)
        if total_natural <= available:
            # Fits perfectly — give extra space to the first (widest text) column
            extra = available - total_natural
            col_widths[0] += extra
        else:
            # Need to shrink — proportional scaling with minimum width of 3
            scale = available / total_natural
            col_widths = [max(3, int(w * scale)) for w in col_widths]

            # Fine-tune: if we overshot, shrink widest column
            while sum(col_widths) > available:
                widest = col_widths.index(max(col_widths))
                col_widths[widest] -= 1

            # If we undershot, grow first column
            while sum(col_widths) < available:
                col_widths[0] += 1

        def _format_cell(text: str, width: int, right_align: bool) -> str:
            """Truncate and pad a cell's text to exactly *width* characters."""
            if len(text) > width:
                text = text[:width - 1] + "~" if width > 1 else text[:width]
            if right_align:
                return text.rjust(width)
            return text.ljust(width)

        def _format_row(row, bold=False):
            """Format a full row and append to self.lines."""
            parts = []
            for ci, cell in enumerate(row):
                parts.append(_format_cell(cell, col_widths[ci], is_numeric[ci]))
            row_text = (" " * gap).join(parts)
            self.lines.append(ReceiptLine(text=row_text[:self.cpl], bold=bold))

        # Emit header row
        if rows:
            _format_row(rows[0], bold=True)
            # Separator: dashes per column, separated by spaces
            sep = (" " * gap).join("-" * w for w in col_widths)
            self.lines.append(ReceiptLine(text=sep[:self.cpl]))

        # Emit data rows
        for row in rows[1:]:
            _format_row(row)

        self.lines.append(ReceiptLine(type="blank"))

    def _visit_blank_line(self, node: dict):
        self.lines.append(ReceiptLine(type="blank"))

    # Aliases — mistune may use different names
    _visit_block_text = _visit_paragraph
    _visit_newline = _visit_blank_line

    # -- inline text extraction ----------------------------------------

    def _extract_text(self, node: dict) -> str:
        """Recursively extract plain text from an AST node."""
        parts: List[str] = []
        self._collect_text(node, parts)
        return "".join(parts)

    def _collect_text(self, node: dict, parts: List[str]):
        ntype = node.get("type", "")
        if ntype == "text":
            parts.append(node.get("raw", node.get("text", node.get("children", ""))))
        elif ntype == "codespan":
            parts.append(node.get("raw", node.get("text", "")))
        elif ntype == "softbreak" or ntype == "linebreak":
            parts.append("\n")
        elif ntype in ("strong", "emphasis", "link", "paragraph",
                        "heading", "block_quote", "list_item",
                        "table_cell", "table_head", "table_body",
                        "table_row", "strikethrough"):
            children = node.get("children")
            if children:
                if isinstance(children, list):
                    for child in children:
                        if isinstance(child, dict):
                            self._collect_text(child, parts)
                elif isinstance(children, str):
                    parts.append(children)
        elif ntype == "image":
            alt = node.get("alt", node.get("children", ""))
            if isinstance(alt, str):
                parts.append(f"[img:{alt}]")
        else:
            # Generic fallback
            raw = node.get("raw", node.get("text", ""))
            if raw and isinstance(raw, str):
                parts.append(raw)
            children = node.get("children")
            if children and isinstance(children, list):
                for child in children:
                    if isinstance(child, dict):
                        self._collect_text(child, parts)

    def _is_all_bold(self, node: dict) -> bool:
        """Check if a node consists entirely of a single <strong> child."""
        children = node.get("children", [])
        if isinstance(children, list) and len(children) == 1:
            child = children[0]
            if isinstance(child, dict) and child.get("type") == "strong":
                return True
        return False

    def _extract_table_rows(self, node: dict) -> List[List[str]]:
        """Extract table data as list of rows (list of cell strings).

        Handles mistune 3.x table AST:
          table → [table_head, table_body]
          table_head → [table_cell, table_cell, ...]      (no row wrapper)
          table_body → [table_row → [table_cell, ...], ...]
        """
        rows: List[List[str]] = []
        children = node.get("children", [])
        for section in children:
            sec_type = section.get("type", "")
            sec_children = section.get("children", [])

            if sec_type == "table_head":
                # table_head children are table_cell directly (one header row)
                cells: List[str] = []
                for cell_node in sec_children:
                    if cell_node.get("type") == "table_cell":
                        cells.append(self._extract_text(cell_node).strip())
                if cells:
                    rows.append(cells)

            elif sec_type == "table_body":
                # table_body children are table_row, each containing table_cell
                for row_node in sec_children:
                    cells = []
                    for cell_node in row_node.get("children", []):
                        if isinstance(cell_node, dict):
                            cells.append(self._extract_text(cell_node).strip())
                    if cells:
                        rows.append(cells)

            else:
                # Fallback: try treating children as rows
                for row_node in sec_children:
                    cells = []
                    for cell_node in row_node.get("children", []):
                        if isinstance(cell_node, dict):
                            cells.append(self._extract_text(cell_node).strip())
                    if cells:
                        rows.append(cells)

        return rows


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _preprocess_markdown(markdown: str) -> str:
    """
    Preprocess Markdown to avoid common receipt-formatting pitfalls.

    - Ensure thematic breaks (---) are surrounded by blank lines so they
      aren't interpreted as setext heading underlines.
    """
    lines = markdown.split("\n")
    result = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Detect thematic break patterns: ---, ***, ___
        if re.match(r'^[-*_]{3,}$', stripped):
            # Add blank line before if previous line is non-empty
            if result and result[-1].strip() != "":
                result.append("")
            result.append(line)
            # Add blank line after (will be handled naturally by next iteration)
            result.append("")
        else:
            result.append(line)
    return "\n".join(result)


def parse_markdown_to_receipt_lines(
    markdown: str,
    chars_per_line: int = 48,
) -> List[ReceiptLine]:
    """
    Parse a Markdown string and return a list of ReceiptLine objects
    ready for receipt-printer rendering.
    """
    markdown = _preprocess_markdown(markdown)

    md = mistune.create_markdown(renderer=None, plugins=['table', 'strikethrough'])
    ast = md(markdown)  # returns list of dicts when renderer=None

    walker = _ASTWalker(chars_per_line)
    lines = walker.walk(ast)

    # Clean up: collapse consecutive blanks
    cleaned: List[ReceiptLine] = []
    prev_blank = False
    for line in lines:
        if line.type == "blank":
            if not prev_blank:
                cleaned.append(line)
            prev_blank = True
        else:
            prev_blank = False
            cleaned.append(line)

    # Remove trailing blanks
    while cleaned and cleaned[-1].type == "blank":
        cleaned.pop()

    return cleaned
