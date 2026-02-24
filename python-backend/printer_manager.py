"""
Printer Manager — enumerate Windows printers via win32print.

Falls back to an empty list on non-Windows platforms (for dev/testing).
"""
from __future__ import annotations

import sys
from typing import List, Dict


def list_printers() -> List[Dict[str, object]]:
    """
    Return a list of installed Windows printers.

    Each item: {"name": str, "isDefault": bool}
    """
    if sys.platform != "win32":
        return []

    try:
        import win32print

        default_printer = ""
        try:
            default_printer = win32print.GetDefaultPrinter()
        except Exception:
            pass

        # EnumPrinters flags: PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        printers_raw = win32print.EnumPrinters(flags, None, 2)

        printers = []
        for info in printers_raw:
            name = info["pPrinterName"]
            printers.append({
                "name": name,
                "isDefault": (name == default_printer),
            })

        return printers

    except ImportError:
        # pywin32 not installed
        return []
    except Exception:
        return []
