#
# zcode-dream-skin/app/win/restore-official.ps1
# 应急入口：恢复 ZCode 官方外观并弹窗反馈（由开始菜单快捷方式 / restore-official.vbs 调用）。
# 注意：本文件必须保存为 UTF-8 with BOM（PowerShell 5.1 中文）。
# @author DamonYanglong
# @date 2026/09/18
#
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$node = Join-Path $dir 'runtime\node.exe'
if (-not (Test-Path $node)) { $node = 'node' }

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $node
$psi.Arguments = ('"{0}"' -f (Join-Path $dir 'engine\scripts\restore.mjs'))
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
$p = [System.Diagnostics.Process]::Start($psi)
$out = $p.StandardOutput.ReadToEnd() + $p.StandardError.ReadToEnd()
$p.WaitForExit()

Add-Type -AssemblyName System.Windows.Forms
if ($p.ExitCode -eq 0) {
    [void][System.Windows.Forms.MessageBox]::Show($out, 'ZCode Dream Skin · 已恢复官方外观', 'OK', 'Information')
} else {
    [void][System.Windows.Forms.MessageBox]::Show($out, 'ZCode Dream Skin · 恢复失败', 'OK', 'Warning')
}
