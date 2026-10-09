# Starts the agent-office-3d server without a console window (unless it already runs) and opens
# the monitor. The desktop and log-in shortcuts run this; so does install.ps1.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1 [-NoBrowser] [-FromShortcut]
#
#   -NoBrowser     only start the server (the log-in shortcut)
#   -FromShortcut  there is no console to read, so problems are shown in a message box
#
# The server's output goes to data\server.log. Stop it with scripts\stop.ps1.
# Windows PowerShell 5.1. Keep this file ASCII-only.
param([switch]$NoBrowser, [switch]$FromShortcut)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

function Show-Problem([string]$Text) {
    if ($FromShortcut) {
        $null = (New-Object -ComObject WScript.Shell).Popup($Text, 0, 'agent-office-3d', 48)
    } else {
        Write-Host $Text -ForegroundColor Red
    }
}

# Any other error: a shortcut has no console, so say it in a message box instead of nothing.
trap {
    Show-Problem "agent-office-3d could not start:`n$_"
    exit 1
}

# Not Start-Process: it reads its folder as a wildcard and fails in a folder like "agent-office [2]".
function Start-Program([string]$File, [string]$Arguments, [string]$Folder, [switch]$Hidden) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $File
    $info.Arguments = $Arguments
    $info.UseShellExecute = $true
    if ($Folder) { $info.WorkingDirectory = $Folder }
    if ($Hidden) { $info.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden }
    $null = [System.Diagnostics.Process]::Start($info)
}

# Edge (part of Windows) can open the page as a narrow app window without tabs or address bar;
# any other browser works too, it just opens a normal tab.
function Open-Monitor([string]$Url) {
    $edge = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if ($edge) {
        Start-Program $edge "--app=$Url --window-size=600,1000"
    } else {
        Start-Program $Url
    }
}

$port = Get-AgentOfficePort
$url = "http://127.0.0.1:$port/"

if (Test-AgentOffice $port) {
    Write-Host "agent-office-3d is already running: $url"
} else {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) {
        Show-Problem 'Node.js was not found. Install Node.js 20 or newer from https://nodejs.org and try again.'
        exit 1
    }
    if (-not (Test-Path -LiteralPath (Join-Path $AgentOfficeRoot 'node_modules\ws'))) {
        Show-Problem "The packages are missing. Run install.ps1 (or npm install) in $AgentOfficeRoot first."
        exit 1
    }
    $dataDir = Get-AgentOfficeDataDir
    $null = [System.IO.Directory]::CreateDirectory($dataDir)
    $log = Join-Path $dataDir 'server.log'
    # cmd gives node a console of its own (hidden), so closing this window does not stop the
    # server, and it writes the server's output to the log file.
    $command = '""' + $node.Source + '" server\index.js 1>"' + $log + '" 2>&1"'
    Start-Program $env:ComSpec ('/d /s /c ' + $command) $AgentOfficeRoot -Hidden

    $deadline = (Get-Date).AddSeconds(15)
    while (-not (Test-AgentOffice $port)) {
        if ((Get-Date) -gt $deadline) {
            $detail = ''
            if (Test-Path -LiteralPath $log) { $detail = (Get-Content -LiteralPath $log -Tail 5 -ErrorAction SilentlyContinue) -join "`n" }
            Show-Problem "The agent-office-3d server did not start on port $port.`n$detail`n(Full output: $log)"
            exit 1
        }
        Start-Sleep -Milliseconds 250
    }
    Write-Host "agent-office-3d started: $url"
}

if (-not $NoBrowser) { Open-Monitor $url }
exit 0
