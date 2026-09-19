#
# zcode-dream-skin/app/win/kill-tray.ps1
# 停止常驻托盘进程（卸载前调用，避免文件占用/残留图标）。
# 注意：本文件必须保存为 UTF-8 with BOM（PowerShell 5.1 中文）。
# @author DamonYanglong
# @date 2026/09/19
#
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'tray\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
exit 0
