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

# Not WScript.Shell: it converts paths to the ANSI code page, so with a user name like a Turkish
# one on English Windows it could not save to the desktop, and the arguments pointed at a folder
# that does not exist (D66). Shell32's link object keeps Unicode, but it only opens an existing
# shortcut, so we first write an empty one: the 76-byte header of MS-SHLLINK 2.1 (size, class id,
# show command 1) and the 4-byte terminal block, no target yet.
function Get-Link([string]$File) {
    $folder = (New-Object -ComObject Shell.Application).Namespace((Split-Path -Parent $File))
    return $folder.ParseName((Split-Path -Leaf $File)).GetLink
}

function New-EmptyLink([string]$File) {
    $bytes = New-Object byte[] 80
    [BitConverter]::GetBytes([int]0x4C).CopyTo($bytes, 0)
    ([Guid]'00021401-0000-0000-C000-000000000046').ToByteArray().CopyTo($bytes, 4)
    [BitConverter]::GetBytes([int]1).CopyTo($bytes, 60)
    [System.IO.File]::WriteAllBytes($File, $bytes)
}

if ($Action -eq 'add') {
    $null = [System.IO.Directory]::CreateDirectory((Split-Path -Parent $path))
    New-EmptyLink $path
    $link = Get-Link $path
    $link.Path = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`" -FromShortcut"
    if ($Place -eq 'startup') { $arguments += ' -NoBrowser' }
    $link.Arguments = $arguments
    $link.WorkingDirectory = $AgentOfficeRoot
    $link.ShowCommand = 7 # minimized: the PowerShell window does not flash up
    $link.Description = 'agent-office-3d: live monitor for Claude Code'
    $icon = Join-Path $PSScriptRoot 'icon.ico'
    if (Test-Path -LiteralPath $icon) { $link.SetIconLocation($icon, 0) }
    $link.Save()
    Write-Host "Shortcut created: $path"
} else {
    if (-not (Test-Path -LiteralPath $path)) { exit 0 }
    $link = Get-Link $path
    if ($link.Arguments.IndexOf("`"$startScript`"", [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        Remove-Item -LiteralPath $path
        Write-Host "Shortcut removed: $path"
    } else {
        Write-Host "Left alone (it does not start this copy of agent-office-3d): $path"
    }
}
exit 0
