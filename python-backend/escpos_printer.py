"""
ESC/POS Printer Module — sends receipt lines to a thermal printer.

Strategy:
  1. Use python-escpos Dummy class to generate ESC/POS byte stream in memory
  2. Send raw bytes to the Windows printer via win32print API directly
  3. This avoids python-escpos Win32Raw class issues and gives full control

Provides clear, actionable error messages when the printer port is misconfigured.
"""
from __future__ import annotations

import os
import sys
from typing import List, Optional

from PIL import Image

from md_parser import ReceiptLine


# ---------------------------------------------------------------------------
# Win32 raw printing — send ESC/POS bytes directly via win32print
# ---------------------------------------------------------------------------

def _send_raw_to_printer(printer_name: str, data: bytes):
    """
    Send raw bytes to a Windows printer using win32print.
    Bypasses GDI and sends ESC/POS commands directly in RAW mode.
    """
    import win32print

    handle = None
    try:
        handle = win32print.OpenPrinter(printer_name)
    except Exception as e:
        raise RuntimeError(
            f"Cannot open printer '{printer_name}'. "
            f"Make sure the printer is installed in Windows Settings > Printers & Scanners. "
            f"Error: {e}"
        )

    try:
        # Check printer status and port for diagnostics
        info = win32print.GetPrinter(handle, 2)
        port = info.get("pPortName", "")
        status = info.get("Status", 0)

        # Try to start the print job
        try:
            job_id = win32print.StartDocPrinter(handle, 1, ("MD to Print Receipt", None, "RAW"))
        except Exception as e:
            error_msg = str(e)
            if "1905" in error_msg or "deleted" in error_msg.lower():
                raise RuntimeError(
                    f"Printer '{printer_name}' cannot accept print jobs (error 1905). "
                    f"Current port: '{port}' | Status: {_decode_status(status)}.\n\n"
                    f"HOW TO FIX:\n"
                    f"1. Open Windows Settings > Printers & Scanners\n"
                    f"2. Click '{printer_name}' > Printer properties\n"
                    f"3. Go to the 'Ports' tab\n"
                    f"4. Select the correct USB port (usually 'USB001' or 'USB002')\n"
                    f"   - Currently set to '{port}' which may be wrong\n"
                    f"5. Click OK and try printing again\n\n"
                    f"If the printer is USB-connected, the port MUST be a USB port, not LPT."
                )
            elif "offline" in error_msg.lower():
                raise RuntimeError(
                    f"Printer '{printer_name}' is offline. "
                    f"Check USB cable and power. Port: {port}"
                )
            else:
                raise RuntimeError(
                    f"Cannot start print job on '{printer_name}': {e}. Port: {port}"
                )

        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, data)
            win32print.EndPagePrinter(handle)
            win32print.EndDocPrinter(handle)
        except Exception as e:
            try:
                win32print.EndDocPrinter(handle)
            except Exception:
                pass
            raise RuntimeError(f"Error during printing: {e}")

    finally:
        if handle:
            win32print.ClosePrinter(handle)


def _decode_status(status: int) -> str:
    """Decode win32print status flags to human-readable string."""
    if status == 0:
        return "READY"
    flags = []
    STATUS_MAP = {
        0x00000001: "PAUSED", 0x00000002: "ERROR", 0x00000004: "PENDING_DELETION",
        0x00000008: "PAPER_JAM", 0x00000010: "PAPER_OUT", 0x00000020: "MANUAL_FEED",
        0x00000040: "PAPER_PROBLEM", 0x00000080: "OFFLINE", 0x00000100: "IO_ACTIVE",
        0x00000200: "BUSY", 0x00000400: "PRINTING", 0x00000800: "OUTPUT_BIN_FULL",
        0x00001000: "NOT_AVAILABLE", 0x00002000: "WAITING", 0x00004000: "PROCESSING",
        0x00008000: "INITIALIZING", 0x00010000: "WARMING_UP",
    }
    for flag, name in STATUS_MAP.items():
        if status & flag:
            flags.append(name)
    return " | ".join(flags) if flags else f"STATUS({status})"


# ---------------------------------------------------------------------------
# ESC/POS byte generation using python-escpos Dummy
# ---------------------------------------------------------------------------

def _generate_escpos_bytes(
    lines: List[ReceiptLine],
    chars_per_line: int = 48,
    cut_after: bool = True,
    font_scale: int = 1,
    top_margin: int = 0,
    bottom_margin: int = 3,
) -> bytes:
    """
    Generate ESC/POS byte stream from ReceiptLine objects.
    Uses python-escpos Dummy printer to build the byte buffer in memory.
    """
    from escpos.printer import Dummy

    p = Dummy()

    # Initialize: ESC @ — reset printer
    p._raw(b'\x1b\x40')

    # Top margin
    if top_margin > 0:
        p.text("\n" * top_margin)

    for line in lines:
        _emit_line(p, line, chars_per_line, font_scale)

    # Bottom margin
    if bottom_margin > 0:
        p.text("\n" * bottom_margin)

    # Auto-cutter: GS V 66 3 — feed 3 lines then partial cut
    if cut_after:
        p._raw(b'\x1d\x56\x42\x03')

    return p.output


def _emit_line(p, line: ReceiptLine, cpl: int, font_scale: int):
    """Emit ESC/POS commands for a single ReceiptLine to a Dummy printer."""

    if line.type == "blank":
        p.text("\n")
        return

    if line.type == "divider":
        p.set(align="center", bold=False)
        p.text("-" * cpl + "\n")
        p.set(align="left", bold=False)
        return

    if line.type == "qr":
        p.set(align=line.align or "center")
        try:
            p.qr(line.text, size=6)
        except Exception:
            p.text(f"[QR:{line.text}]\n")
        p.set(align="left")
        return

    if line.type == "image":
        _emit_image(p, line.text, line.align)
        return

    # --- Normal text line ---
    align = line.align or "left"
    bold = line.bold
    dh = line.double_height
    dw = line.double_width

    width_mult = min(font_scale, 4) if not dw else min(font_scale + 1, 8)
    height_mult = min(font_scale, 4) if not dh else min(font_scale + 1, 8)

    if font_scale <= 1 and not dh and not dw:
        p.set(align=align, bold=bold, underline=line.underline)
    else:
        p.set(
            align=align,
            bold=bold,
            underline=line.underline,
            custom_size=True,
            width=width_mult,
            height=height_mult,
        )

    text = line.text
    if text:
        p.text(text + "\n")

    # Reset to defaults after styled line
    if bold or dh or dw or line.underline or align != "left" or font_scale > 1:
        p.set(align="left", bold=False, underline=False)


# ---------------------------------------------------------------------------
# Image / QR helpers
# ---------------------------------------------------------------------------

MAX_IMAGE_WIDTH = 576  # 203 DPI × ~72mm printable area


def _emit_image(printer, image_path: str, align: str = "center"):
    """Emit ESC/POS image commands, resized to fit receipt width."""
    try:
        img = Image.open(image_path)
        if img.width > MAX_IMAGE_WIDTH:
            ratio = MAX_IMAGE_WIDTH / img.width
            new_h = int(img.height * ratio)
            img = img.resize((MAX_IMAGE_WIDTH, new_h), Image.LANCZOS)
        printer.set(align=align)
        printer.image(img)
        printer.set(align="left")
    except Exception as e:
        printer.text(f"[Image error: {e}]\n")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def print_receipt(
    lines: List[ReceiptLine],
    printer_name: str,
    chars_per_line: int = 48,
    cut_after: bool = True,
    font_scale: int = 1,
    top_margin: int = 0,
    bottom_margin: int = 3,
):
    """
    Print a fully formatted receipt from ReceiptLine objects.

    Generates ESC/POS bytes in memory (via python-escpos Dummy),
    then sends them to the Windows printer via win32print RAW mode.
    """
    data = _generate_escpos_bytes(
        lines,
        chars_per_line=chars_per_line,
        cut_after=cut_after,
        font_scale=font_scale,
        top_margin=top_margin,
        bottom_margin=bottom_margin,
    )
    _send_raw_to_printer(printer_name, data)


def print_image_to_printer(image_path: str, printer_name: str, align: str = "center"):
    """Print an image file to the printer."""
    from escpos.printer import Dummy
    p = Dummy()
    p._raw(b'\x1b\x40')
    _emit_image(p, image_path, align)
    p.text("\n\n\n")
    p._raw(b'\x1d\x56\x42\x03')
    _send_raw_to_printer(printer_name, p.output)


def print_qr_to_printer(content: str, printer_name: str, size: int = 4):
    """Print a QR code to the printer."""
    from escpos.printer import Dummy
    p = Dummy()
    p._raw(b'\x1b\x40')
    p.set(align="center")
    p.qr(content, size=size)
    p.set(align="left")
    p.text("\n\n\n")
    p._raw(b'\x1d\x56\x42\x03')
    _send_raw_to_printer(printer_name, p.output)


def get_printer_diagnostics(printer_name: str) -> dict:
    """Return detailed printer status info for troubleshooting."""
    import win32print
    try:
        handle = win32print.OpenPrinter(printer_name)
        info = win32print.GetPrinter(handle, 2)
        win32print.ClosePrinter(handle)
        return {
            "name": printer_name,
            "port": info.get("pPortName", ""),
            "driver": info.get("pDriverName", ""),
            "status": info.get("Status", 0),
            "statusText": _decode_status(info.get("Status", 0)),
        }
    except Exception as e:
        return {"name": printer_name, "error": str(e)}
