# agent-office-3d installer for Windows.
#
#   powershell -ExecutionPolicy Bypass -File install.ps1
#
# 1. checks Node.js (20 or newer) and runs npm install,
# 2. adds the hook to your Claude Code user settings (%USERPROFILE%\.claude\settings.json, or
#    %CLAUDE_CONFIG_DIR%\settings.json): shows the exact change, asks first, saves a backup,
# 3. offers a desktop shortcut and starting the server when you log in,
# 4. offers to start the server and open the monitor now.
# uninstall.ps1 undoes steps 2 and 3. Safe to run again (it changes only what is missing).
#
# Scripted runs: -Yes approves the settings change without asking; then only the options given
# as switches happen (-DesktopShortcut, -StartOnLogin, -StartNow). -SettingsFile, -ShortcutDir
# and -StartupDir point at other places (the tests use scratch folders).
# Windows PowerShell 5.1. Keep this file ASCII-only.
param(
    [switch]$Yes,
    [switch]$DesktopShortcut,
    [switch]$StartOnLogin,
    [switch]$StartNow,
    [string]$SettingsFile,
    [string]$ShortcutDir,
    [string]$StartupDir
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Step([string]$Text) {
    Write-Host ''
    Write-Host $Text -ForegroundColor Cyan
}

function Ask([string]$Question, [bool]$Default) {
    $hint = '[y/N]'
    if ($Default) { $hint = '[Y/n]' }
    $answer = Read-Host "$Question $hint"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return ($answer.Trim() -match '^(y|yes)$')
}

Write-Host 'agent-office-3d installer' -ForegroundColor Cyan
Write-Host "Folder: $root"

Step '[1/4] Node.js and packages'
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host 'Node.js was not found. Install Node.js 20 or newer (LTS) from https://nodejs.org, open a new terminal and run this again.' -ForegroundColor Red
    exit 1
}
$version = (& $node.Source --version).Trim()
if ([int]($version.TrimStart('v').Split('.')[0]) -lt 20) {
    Write-Host "Node.js $version is too old; version 20 or newer is needed (https://nodejs.org)." -ForegroundColor Red
    exit 1
}
Write-Host "Node.js $version"
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    Write-Host 'npm was not found (it comes with Node.js). Reinstall Node.js and run this again.' -ForegroundColor Red
    exit 1
}
Push-Location $root
try {
    $ErrorActionPreference = 'Continue' # npm prints notices on stderr
    & $npm.Source install --no-audit --no-fund
    $code = $LASTEXITCODE
} finally {
    $ErrorActionPreference = 'Stop'
    Pop-Location
}
if ($code -ne 0) {
    Write-Host 'npm install failed (see above). Nothing else was changed.' -ForegroundColor Red
    exit 1
}

Step '[2/4] Claude Code hooks'
Write-Host 'The hook sends each Claude Code event to the local server (127.0.0.1 only). It runs in the'
Write-Host 'background, never blocks Claude and exits at once when the server is not running.'
Write-Host ''
$setupArgs = @((Join-Path $root 'scripts\setup.js'), 'install')
if ($Yes) { $setupArgs += '--yes' }
if ($SettingsFile) { $setupArgs += @('--settings', $SettingsFile) }
& $node.Source @setupArgs
$code = $LASTEXITCODE
if ($code -eq 2) {
    Write-Host 'Without the hook the monitor gets no events. Run install.ps1 again whenever you like.'
    exit 2
}
if ($code -ne 0) { exit 1 }

Step '[3/4] Shortcuts (optional)'
if ($Yes) { $makeDesktop = [bool]$DesktopShortcut }
else { $makeDesktop = Ask 'Create a desktop shortcut that starts the server and opens the monitor?' $true }
if ($makeDesktop) { & (Join-Path $root 'scripts\shortcut.ps1') -Action add -Place desktop -Dir $ShortcutDir }
if ($Yes) { $makeStartup = [bool]$StartOnLogin }
else { $makeStartup = Ask 'Start the server (without a window) every time you log in to Windows?' $false }
if ($makeStartup) { & (Join-Path $root 'scripts\shortcut.ps1') -Action add -Place startup -Dir $StartupDir }
if (-not $makeDesktop -and -not $makeStartup) { Write-Host 'No shortcuts.' }

Step '[4/4] Start'
if ($Yes) { $startNow = [bool]$StartNow }
else { $startNow = Ask 'Start the server now and open the monitor?' $true }
if ($startNow) {
    & (Join-Path $root 'scripts\start.ps1')
} else {
    Write-Host 'Start it later with the desktop shortcut, scripts\start.ps1 or "npm start".'
}

Write-Host ''
Write-Host 'Done. Use Claude Code in any project and watch the monitor.' -ForegroundColor Green
Write-Host 'Monitor: http://127.0.0.1:<port>/ (7847 unless you changed it). Remove everything: uninstall.ps1'
exit 0
