# Adds or removes an agent-office-3d shortcut.
#
#   scripts\shortcut.ps1 -Action add|remove -Place desktop|startup [-Dir <folder>]
#
#   desktop  "agent-office-3d" on the desktop: starts the server if needed and opens the monitor
#   startup  the same shortcut in the Startup folder with -NoBrowser: the server starts, without a
#            window, whenever you log in to Windows
#   -Dir     another folder (tests)
#
# Remove only deletes a shortcut that points at this folder's start.ps1.
# Windows PowerShell 5.1. Keep this file ASCII-only.
param(
    [Parameter(Mandatory = $true)][ValidateSet('add', 'remove')][string]$Action,
    [Parameter(Mandatory = $true)][ValidateSet('desktop', 'startup')][string]$Place,
    [string]$Dir
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$path = Get-ShortcutPath $Place $Dir
$startScript = Join-Path $PSScriptRoot 'start.ps1'
$shell = New-Object -ComObject WScript.Shell

if ($Action -eq 'add') {
    $null = [System.IO.Directory]::CreateDirectory((Split-Path -Parent $path))
    $link = $shell.CreateShortcut($path)
    $link.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`" -FromShortcut"
    if ($Place -eq 'startup') { $arguments += ' -NoBrowser' }
    $link.Arguments = $arguments
    $link.WorkingDirectory = $AgentOfficeRoot
    $link.WindowStyle = 7 # minimized: the PowerShell window does not flash up
    $link.Description = 'agent-office-3d: live monitor for Claude Code'
    $icon = Join-Path $PSScriptRoot 'icon.ico'
    if (Test-Path $icon) { $link.IconLocation = "$icon,0" }
    $link.Save()
    Write-Host "Shortcut created: $path"
} else {
    if (-not (Test-Path $path)) { exit 0 }
    $link = $shell.CreateShortcut($path)
    if ($link.Arguments -like "*$startScript*") {
        Remove-Item -LiteralPath $path
        Write-Host "Shortcut removed: $path"
    } else {
        Write-Host "Left alone (it does not start this copy of agent-office-3d): $path"
    }
}
exit 0
