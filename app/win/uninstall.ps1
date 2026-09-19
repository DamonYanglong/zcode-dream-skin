#
# zcode-dream-skin/app/win/uninstall.ps1
# 卸载：停止托盘、移除开始菜单快捷方式、删除程序目录（主题库 %APPDATA%\ZCodeDreamSkin 保留）。
# 注意：本文件必须保存为 UTF-8 with BOM（PowerShell 5.1 中文）。
# @author DamonYanglong
# @date 2026/09/18
#
$ErrorActionPreference = 'Stop'
$Dest = Join-Path $env:LOCALAPPDATA 'Programs\ZCodeDreamSkin'

Write-Host '[1/3] 停止托盘 ...'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'tray\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host '[2/3] 移除快捷方式 ...'
$menuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\ZCode Dream Skin'
Remove-Item $menuDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host '[3/3] 删除程序目录 ...'
Write-Host ''
Write-Host "  已卸载。主题库保留在 %APPDATA%\ZCodeDreamSkin（如需彻底清理请手动删除）。"
Write-Host "  程序目录即将自动删除：$Dest"
# 自删目录需等本脚本退出后进行，经 cmd 延迟删除
Start-Process cmd.exe -ArgumentList ('/c timeout /t 2 >nul & rd /s /q "{0}"' -f $Dest) -WindowStyle Hidden
