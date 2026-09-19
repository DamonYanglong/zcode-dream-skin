@echo off
rem ZCode Dream Skin - one-click installer (double-click me)
rem ASCII-only on purpose: .cmd files with non-ASCII need special codepage handling.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
