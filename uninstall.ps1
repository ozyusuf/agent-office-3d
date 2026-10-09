# agent-office-3d uninstaller for Windows.
#
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1
#
# 1. takes the hook out of your Claude Code user settings: shows the change, asks first, saves a
#    backup. If the file did not change since the installer wrote it, it goes back to the exact
#    copy saved before installing; otherwise only agent-office-3d's entries are removed,
# 2. removes the desktop and log-in shortcuts,
# 3. offers to stop the server if it runs.
# This folder (packages, config.json, data\ with your XP) stays; delete it to remove everything.
#
# -Yes answers yes to every question; -SettingsFile, -ShortcutDir, -StartupDir are for tests.
# Windows PowerShell 5.1. Keep this file ASCII-only.
param(
    [switch]$Yes,
    [string]$SettingsFile,
    [string]$ShortcutDir,
    [string]$StartupDir
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'scripts\common.ps1')

function Step([string]$Text) {
    Write-Host ''
    Write-Host $Text -ForegroundColor Cyan
}

Write-Host 'agent-office-3d uninstaller' -ForegroundColor Cyan

Step '[1/3] Claude Code hooks'
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host 'Node.js was not found, so the settings cannot be edited safely. Remove the entries that run' -ForegroundColor Red
    Write-Host "$root\hooks\send-event.ps1 from %USERPROFILE%\.claude\settings.json by hand, or put back the" -ForegroundColor Red
    Write-Host 'backup next to it (settings.json.agent-office-3d-*.bak).' -ForegroundColor Red
    exit 1
}
$setupArgs = @((Join-Path $root 'scripts\setup.js'), 'uninstall')
if ($Yes) { $setupArgs += '--yes' }
if ($SettingsFile) { $setupArgs += @('--settings', $SettingsFile) }
& $node.Source @setupArgs
$code = $LASTEXITCODE
if ($code -eq 2) { exit 2 }
if ($code -ne 0) { exit 1 }

Step '[2/3] Shortcuts'
& (Join-Path $root 'scripts\shortcut.ps1') -Action remove -Place desktop -Dir $ShortcutDir
& (Join-Path $root 'scripts\shortcut.ps1') -Action remove -Place startup -Dir $StartupDir

Step '[3/3] Server'
$port = Get-AgentOfficePort
if (Test-AgentOffice $port) {
    $stop = $true
    if (-not $Yes) {
        $answer = Read-Host 'The server is running. Stop it now? [Y/n]'
        $stop = [string]::IsNullOrWhiteSpace($answer) -or ($answer.Trim() -match '^(y|yes)$')
    }
    if ($stop) { & (Join-Path $root 'scripts\stop.ps1') }
} else {
    Write-Host 'The server is not running.'
}

Write-Host ''
Write-Host 'Done. This folder stays (packages, config.json, data\ with your XP); delete it to remove everything.' -ForegroundColor Green
exit 0
