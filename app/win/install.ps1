#
# zcode-dream-skin/app/win/install.ps1
# Windows 一键安装：拷贝到 %LOCALAPPDATA%\Programs\ZCodeDreamSkin、解除文件锁定、
# 确保 node 运行时（包内自带 runtime\node.exe；缺失且系统无 node≥22 时下载便携版）、
# 生成开始菜单快捷方式（托盘 + 恢复官方外观应急入口），默认装完即启动托盘。
# 注意：本文件必须保存为 UTF-8 with BOM（PowerShell 5.1 中文）。
# 用法: 双击 install.cmd，或 powershell -ExecutionPolicy Bypass -File install.ps1 [-NoLaunch]
# @author DamonYanglong
# @date 2026/09/18
#
param([switch]$NoLaunch)

$ErrorActionPreference = 'Stop'
$Src  = $PSScriptRoot
$Dest = Join-Path $env:LOCALAPPDATA 'Programs\ZCodeDreamSkin'
$NodeVer = '22.23.2'   # 便携版兜底下载版本；正常安装包已内置 runtime，不会走到这里

function Test-NodeOk([string]$Exe) {
    if (-not $Exe -or -not (Test-Path $Exe)) { return $false }
    try { return ((& $Exe --version) 2>$null) -match '^v(2[2-9]|[3-9][0-9])\.' } catch { return $false }
}

Write-Host '[1/5] 复制文件到安装目录 ...'
if ($Src -ine $Dest) {
    robocopy $Src $Dest /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "复制失败（robocopy 代码 $LASTEXITCODE）" }
}

# zip 从浏览器下载解压后，ps1/vbs 带 Zone 标记（MOTW），可能被执行策略拦截——统一解除
# （对齐 Codex Dream Skin 安装器的做法）
Write-Host '[2/5] 解除文件锁定（清除下载区标记）...'
Get-ChildItem $Dest -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

Write-Host '[3/5] 检查 node 运行时 ...'
$runtimeNode = Join-Path $Dest 'runtime\node.exe'
if (-not (Test-NodeOk $runtimeNode)) {
    $sysNode = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (Test-NodeOk $sysNode) {
        Write-Host '       使用系统 node。'
    } else {
        Write-Host "       内置 runtime 缺失且系统无 node≥22，下载便携版 Node v$NodeVer ..."
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
        $tmp = Join-Path $env:TEMP "zds-node-$NodeVer.zip"
        $ex  = Join-Path $env:TEMP "zds-node-extract"
        Invoke-WebRequest "https://nodejs.org/dist/v$NodeVer/node-v$NodeVer-win-$arch.zip" -OutFile $tmp -UseBasicParsing
        Remove-Item $ex -Recurse -Force -ErrorAction SilentlyContinue
        Expand-Archive $tmp -DestinationPath $ex
        New-Item (Join-Path $Dest 'runtime') -ItemType Directory -Force | Out-Null
        Move-Item (Join-Path $ex "node-v$NodeVer-win-$arch\node.exe") $runtimeNode -Force
        Remove-Item $tmp, $ex -Recurse -Force -ErrorAction SilentlyContinue
        if (-not (Test-NodeOk $runtimeNode)) { throw 'node 运行时安装失败，请重试或手动安装 node。' }
    }
}

# 图标（安装器包内已带多尺寸 app.ico；zip 手动路径缺失时才运行时绘制）
Write-Host '[4/5] 生成图标与开始菜单快捷方式 ...'
$icoPath = Join-Path $Dest 'app.ico'
if (-not (Test-Path $icoPath)) {
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap 32, 32
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 124, 92, 255))), 0, 6, 16, 20)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 176, 80))), 12, 6, 20, 20)
    $g.Dispose()
    $fs = [System.IO.File]::Create($icoPath)
    [System.Drawing.Icon]::FromHandle($bmp.GetHicon()).Save($fs)
    $fs.Close()
}

# 快捷方式放「开始菜单\ZCode Dream Skin」文件夹（与 Inno 安装器的 {group} 一致，避免两套入口）
$menuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\ZCode Dream Skin'
New-Item $menuDir -ItemType Directory -Force | Out-Null
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $menuDir 'ZCode Dream Skin.lnk'))
$lnk.TargetPath = (Join-Path $Dest 'launch-tray.vbs')
$lnk.WorkingDirectory = $Dest
$lnk.IconLocation = "$icoPath,0"
$lnk.Save()
# 应急入口（对齐 Codex Dream Skin 的 Restore 快捷方式）
$lnk2 = $ws.CreateShortcut((Join-Path $menuDir 'ZCode Dream Skin 恢复官方外观.lnk'))
$lnk2.TargetPath = (Join-Path $Dest 'restore-official.vbs')
$lnk2.WorkingDirectory = $Dest
$lnk2.IconLocation = "$icoPath,0"
$lnk2.Save()

Write-Host '[5/5] 完成。'
Write-Host ''
Write-Host "  安装目录：$Dest"
Write-Host '  开始菜单：「ZCode Dream Skin」（托盘常驻）'
Write-Host '            「ZCode Dream Skin 恢复官方外观」（应急还原）'
if (-not $NoLaunch) {
    # 防双开：托盘已在运行（重装/更新场景）就不再拉起第二个
    $trayRunning = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'tray\.ps1' }
    if ($trayRunning) {
        Write-Host '托盘已在运行，保持现状。'
    } else {
        Write-Host ''
        Write-Host '正在启动托盘 ...（调色板图标，常驻系统托盘）'
        Start-Process wscript.exe -ArgumentList ('"{0}"' -f (Join-Path $Dest 'launch-tray.vbs'))
    }
}
Write-Host ''
