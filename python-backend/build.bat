@echo off
REM Build the Python backend into a standalone exe via PyInstaller
REM Usage: cd python-backend && build.bat

echo Installing dependencies...
pip install -r requirements.txt
pip install pyinstaller

echo.
echo Building backend executable...
pyinstaller --onedir ^
    --name md-to-print-backend ^
    --add-data "md_parser.py;." ^
    --add-data "escpos_printer.py;." ^
    --add-data "printer_manager.py;." ^
    --hidden-import win32print ^
    --hidden-import win32api ^
    --hidden-import escpos.printer ^
    --hidden-import escpos ^
    --hidden-import PIL ^
    --hidden-import qrcode ^
    --hidden-import mistune ^
    --noconfirm ^
    --clean ^
    backend.py

echo.
echo Build complete! Output in: dist\md-to-print-backend\
echo You can test with: dist\md-to-print-backend\md-to-print-backend.exe
pause
