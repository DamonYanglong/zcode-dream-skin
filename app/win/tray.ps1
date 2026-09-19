#
# zcode-dream-skin/app/win/tray.ps1
# ZCode Dream Skin Windows 托盘常驻程序（对应 macOS 菜单栏 app）。
# 复用 zip 包内 engine（engine/scripts/*.mjs），通过 node 执行；界面用自带 WinForms。
# 注意：本文件必须保存为 UTF-8 with BOM，否则 PowerShell 5.1 中文乱码。
# 用法: powershell -ExecutionPolicy Bypass -File tray.ps1 [-ListThemes]
# @author DamonYanglong
# @date 2026/09/18
#
param([switch]$ListThemes)

$ErrorActionPreference = 'Stop'

# ---------- 路径与常量 ----------
$Script:SupportDir   = Join-Path $env:APPDATA 'ZCodeDreamSkin'
$Script:ThemesDir    = Join-Path $Script:SupportDir 'themes'
$Script:StateFile    = Join-Path $Script:SupportDir 'current-theme'
$Script:EngineDir    = Join-Path $PSScriptRoot 'engine'
$Script:EngineScript = Join-Path $Script:EngineDir 'scripts'
$Script:EngineThemes = Join-Path $Script:EngineDir 'themes'

# ---------- 主题发现（对齐 main.swift：内置主题 + 用户库，同 id 用户库覆盖） ----------
function Get-ThemeMap {
    $map = @{}
    foreach ($dir in @($Script:EngineThemes, $Script:ThemesDir)) {
        if (-not (Test-Path $dir)) { continue }
        Get-ChildItem $dir -Directory | ForEach-Object {
            $meta = Join-Path $_.FullName 'theme.json'
            if (-not (Test-Path $meta)) { return }
            try {
                $obj = Get-Content $meta -Raw -Encoding UTF8 | ConvertFrom-Json
                $id = [string]$obj.id
                if (-not $id) { $id = $_.Name }
                # PS 5.1 哈希表值不支持 if 表达式，先算好再放进 [pscustomobject]
                $name = if ($obj.name) { [string]$obj.name } else { $id }
                $map[$id] = [pscustomobject]@{ Id = $id; Name = $name }
            } catch { /* 跳过不完整主题 */ }
        }
    }
    return $map
}

function Get-CurrentThemeId {
    if (Test-Path $Script:StateFile) {
        return (Get-Content $Script:StateFile -Raw -Encoding UTF8).Trim()
    }
    return $null
}

# ---------- 引擎调用（node + 环境变量指向用户目录；无窗口，UTF-8 收输出） ----------
# node 解析：内置 runtime 优先（对齐 Codex Dream Skin：安装自带运行时，不依赖 PATH），系统 PATH 兜底
$Script:NodeExe = Join-Path $PSScriptRoot 'runtime\node.exe'
if (-not (Test-Path $Script:NodeExe)) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { $Script:NodeExe = $cmd.Source } else { $Script:NodeExe = $null }
}

function Invoke-Engine {
    param([string]$Script, [string]$ScriptArgs)
    if (-not $Script:NodeExe) {
        return @{ Ok = $false; Output = '未找到 node：内置 runtime 缺失，且系统未安装 node。请重新安装本包，或 winget install OpenJS.NodeJS.LTS' }
    }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Script:NodeExe
    $psi.Arguments = ('"{0}" {1}' -f (Join-Path $Script:EngineScript $Script), $ScriptArgs)
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $psi.EnvironmentVariables['ZDS_THEMES_DIR'] = $Script:ThemesDir
    $psi.EnvironmentVariables['ZDS_STATE_DIR'] = $Script:SupportDir
    $p = [System.Diagnostics.Process]::Start($psi)
    $out = $p.StandardOutput.ReadToEnd() + $p.StandardError.ReadToEnd()
    $p.WaitForExit()
    return @{ Ok = ($p.ExitCode -eq 0); Output = $out.Trim() }
}

function Invoke-EngineChecked {
    # 成功静默；失败弹窗（对齐 macOS 菜单栏 app 行为）
    param([string]$Script, [string]$ScriptArgs, [string]$Balloon)
    if ($Balloon) { Show-Balloon $Balloon }
    $r = Invoke-Engine -Script $Script -ScriptArgs $ScriptArgs
    if (-not $r.Ok) {
        [void][System.Windows.Forms.MessageBox]::Show($r.Output, 'ZCode Dream Skin', 'OK', 'Warning')
    }
    return $r
}

# ---------- 无界面测试模式：列出可发现的主题 ----------
if ($ListThemes) {
    Write-Output "themes-dir: $($Script:ThemesDir)"
    # PS 5.1 不支持对命令结果直接取方法（Get-ThemeMap.GetEnumerator() 非法），先入变量
    $themes = Get-ThemeMap
    $themes.GetEnumerator() | Sort-Object Value.Name | ForEach-Object {
        Write-Output ("{0}`t{1}" -f $_.Value.Id, $_.Value.Name)
    }
    Write-Output "current: $(Get-CurrentThemeId)"
    exit 0
}

# ---------- UI ----------
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Show-Balloon {
    param([string]$Text)
    $Script:NotifyIcon.ShowBalloonTip(2000, 'ZCode Dream Skin', $Text, 'Info')
}

# 托盘图标运行时绘制（调色板双色块），免去随包分发 .ico
$Script:IconBmp = New-Object System.Drawing.Bitmap 16, 16
$g = [System.Drawing.Graphics]::FromImage($Script:IconBmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 124, 92, 255))), 0, 3, 8, 10)
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 176, 80))), 6, 3, 10, 10)
$g.Dispose()
$Script:TrayIcon = [System.Drawing.Icon]::FromHandle($Script:IconBmp.GetHicon())

$Script:Menu = New-Object System.Windows.Forms.ContextMenuStrip

function New-MenuItem {
    param([string]$Text, [string]$Tag, [switch]$Disabled)
    $item = New-Object System.Windows.Forms.ToolStripMenuItem
    $item.Text = $Text
    if ($Tag) { $item.Tag = $Tag }
    $item.Enabled = (-not $Disabled)
    return $item
}

# 每次打开菜单时重建：主题列表/当前勾选保持新鲜（对齐 NSMenu menuNeedsUpdate）
function Rebuild-Menu {
    $Script:Menu.Items.Clear()
    $current = Get-CurrentThemeId

    [void]$Script:Menu.Items.Add((New-MenuItem 'ZCode Dream Skin' $null -Disabled))
    $statusText = if ($current) { "当前主题：$current" } else { '状态：官方外观' }
    [void]$Script:Menu.Items.Add((New-MenuItem $statusText $null -Disabled))
    [void]$Script:Menu.Items.Add('-')   # 分隔线

    [void]$Script:Menu.Items.Add((New-MenuItem '切换主题' $null -Disabled))
    $themes = Get-ThemeMap
    if ($themes.Count -eq 0) {
        [void]$Script:Menu.Items.Add((New-MenuItem '（无主题，先导入）' $null -Disabled))
    } else {
        foreach ($t in ($themes.GetEnumerator() | Sort-Object Value.Name)) {
            $item = New-MenuItem $t.Value.Name $t.Value.Id
            $item.Checked = ($t.Value.Id -eq $current)
            $item.Add_Click({
                param($sender, $e)
                Invoke-EngineChecked -Script 'apply.mjs' -ScriptArgs ('--theme "{0}"' -f $sender.Tag)
            }.GetNewClosure())
            [void]$Script:Menu.Items.Add($item)
        }
    }

    [void]$Script:Menu.Items.Add('-')
    $start = New-MenuItem '以换肤模式启动 ZCode…' 'start'
    $start.Add_Click({ Invoke-EngineChecked -Script 'start-themed.mjs' -ScriptArgs '' -Balloon '正在以换肤模式启动 ZCode…' }.GetNewClosure())
    [void]$Script:Menu.Items.Add($start)

    $reapply = New-MenuItem '重新注入当前主题' 'reapply'
    $reapply.Add_Click({
        $id = Get-CurrentThemeId
        if (-not $id) {
            [void][System.Windows.Forms.MessageBox]::Show('尚无已应用主题，请先切换一个主题。', 'ZCode Dream Skin', 'OK', 'Warning')
            return
        }
        Invoke-EngineChecked -Script 'apply.mjs' -ScriptArgs ('--theme "{0}"' -f $id)
    }.GetNewClosure())
    [void]$Script:Menu.Items.Add($reapply)

    $restore = New-MenuItem '恢复官方外观' 'restore'
    $restore.Add_Click({ Invoke-EngineChecked -Script 'restore.mjs' -ScriptArgs '' }.GetNewClosure())
    [void]$Script:Menu.Items.Add($restore)

    $import = New-MenuItem '导入主题 ZIP…' 'import'
    $import.Add_Click({
        $dlg = New-Object System.Windows.Forms.OpenFileDialog
        $dlg.Filter = 'ZIP 压缩包 (*.zip)|*.zip'
        $dlg.Title = '选择 DreamSkin 主题 ZIP 包（theme.json + theme.css + 背景图）'
        if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
        $r = Invoke-Engine -Script 'import-theme.mjs' -ScriptArgs ('--zip "{0}"' -f $dlg.FileName)
        if ($r.Ok) {
            [void][System.Windows.Forms.MessageBox]::Show('主题已加入你的主题库，重新打开菜单即可切换。', '导入完成', 'OK', 'Information')
        } else {
            [void][System.Windows.Forms.MessageBox]::Show($r.Output, '导入失败', 'OK', 'Warning')
        }
    }.GetNewClosure())
    [void]$Script:Menu.Items.Add($import)

    $openDir = New-MenuItem '打开主题文件夹' 'open'
    $openDir.Add_Click({
        if (-not (Test-Path $Script:ThemesDir)) { New-Item -ItemType Directory -Path $Script:ThemesDir -Force | Out-Null }
        Start-Process explorer.exe $Script:ThemesDir
    }.GetNewClosure())
    [void]$Script:Menu.Items.Add($openDir)

    [void]$Script:Menu.Items.Add('-')
    $about = New-MenuItem '关于 ZCode Dream Skin' 'about'
    $about.Add_Click({
        [void][System.Windows.Forms.MessageBox]::Show(
            "给 ZCode 桌面端换肤的非官方小工具。`n本机回环 CDP 注入，不修改官方安装包。`n`n感谢 Codex Dream Skin 的工程范式与主题资产。",
            'ZCode Dream Skin', 'OK', 'Information')
    }.GetNewClosure())
    [void]$Script:Menu.Items.Add($about)

    [void]$Script:Menu.Items.Add('-')
    $quit = New-MenuItem '退出' 'quit'
    $quit.Add_Click({
        $Script:NotifyIcon.Visible = $false
        $Script:TrayIcon.Dispose()
        [System.Windows.Forms.Application]::Exit()
    }.GetNewClosure())
    [void]$Script:Menu.Items.Add($quit)
}

$Script:Menu.Add_Opening({ Rebuild-Menu }.GetNewClosure())
Rebuild-Menu

$Script:NotifyIcon = New-Object System.Windows.Forms.NotifyIcon
$Script:NotifyIcon.Icon = $Script:TrayIcon
$Script:NotifyIcon.Text = 'ZCode Dream Skin'
$Script:NotifyIcon.Visible = $true
$Script:NotifyIcon.ContextMenuStrip = $Script:Menu

[System.Windows.Forms.Application]::Run()
