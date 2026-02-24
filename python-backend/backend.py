"""
MD to Print — Python Backend
Stdin/Stdout JSON-line IPC protocol for Electron.

Commands:
  list_printers    → {printers: [{name, isDefault}]}
  parse_preview    → {lines: [{text, bold, align, type, doubleHeight, doubleWidth}]}
  print            → {success, error?}
  print_image      → {success, error?}
  print_qr         → {success, error?}
"""
import sys
import json
import traceback

from md_parser import parse_markdown_to_receipt_lines, receipt_lines_to_dicts
from escpos_printer import (
    print_receipt, print_image_to_printer, print_qr_to_printer,
    get_printer_diagnostics,
)
from printer_manager import list_printers


def handle_command(cmd: dict) -> dict:
    """Dispatch a single command and return a response dict."""
    action = cmd.get("action", "")

    if action == "list_printers":
        printers = list_printers()
        return {"printers": printers}

    elif action == "parse_preview":
        markdown = cmd.get("markdown", "")
        paper_width = cmd.get("paperWidth", 80)
        chars = 48 if paper_width >= 80 else 32
        lines = parse_markdown_to_receipt_lines(markdown, chars_per_line=chars)
        return {"lines": receipt_lines_to_dicts(lines)}

    elif action == "print":
        markdown = cmd.get("markdown", "")
        printer_name = cmd.get("printerName", "")
        paper_width = cmd.get("paperWidth", 80)
        cut_after = cmd.get("cutAfter", True)
        font_scale = cmd.get("fontScale", 1)
        top_margin = cmd.get("topMargin", 0)
        bottom_margin = cmd.get("bottomMargin", 3)
        chars = 48 if paper_width >= 80 else 32

        lines = parse_markdown_to_receipt_lines(markdown, chars_per_line=chars)
        print_receipt(
            lines,
            printer_name=printer_name,
            chars_per_line=chars,
            cut_after=cut_after,
            font_scale=font_scale,
            top_margin=top_margin,
            bottom_margin=bottom_margin,
        )
        return {"success": True}

    elif action == "print_image":
        image_path = cmd.get("imagePath", "")
        printer_name = cmd.get("printerName", "")
        align = cmd.get("align", "center")
        print_image_to_printer(image_path, printer_name, align)
        return {"success": True}

    elif action == "print_qr":
        content = cmd.get("content", "")
        printer_name = cmd.get("printerName", "")
        size = cmd.get("size", 4)
        print_qr_to_printer(content, printer_name, size)
        return {"success": True}

    elif action == "printer_diagnostics":
        printer_name = cmd.get("printerName", "")
        if not printer_name:
            return {"success": False, "error": "No printer name provided"}
        diag = get_printer_diagnostics(printer_name)
        return {"success": True, "diagnostics": diag}

    else:
        return {"success": False, "error": f"Unknown action: {action}"}


def main():
    """Main loop: read JSON lines from stdin, write JSON responses to stdout."""
    # Signal readiness
    sys.stdout.write(json.dumps({"status": "ready"}) + "\n")
    sys.stdout.flush()

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue

        response = {}
        request_id = None
        try:
            cmd = json.loads(raw_line)
            request_id = cmd.get("id")
            response = handle_command(cmd)
        except json.JSONDecodeError as e:
            response = {"success": False, "error": f"Invalid JSON: {e}"}
        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            response = {"success": False, "error": str(e)}

        if request_id is not None:
            response["id"] = request_id

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
