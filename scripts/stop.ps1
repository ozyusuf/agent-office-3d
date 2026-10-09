# Stops the agent-office-3d server, also one started without a window by start.ps1.
#
#   powershell -ExecutionPolicy Bypass -File scripts\stop.ps1
#
# Asks the server to exit (POST /shutdown) so it saves the XP file first.
# Windows PowerShell 5.1. Keep this file ASCII-only.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$port = Get-AgentOfficePort
if (-not (Test-AgentOffice $port)) {
    Write-Host "agent-office-3d is not running on port $port."
    exit 0
}
$null = Invoke-AgentOffice 'POST' '/shutdown' $port
$deadline = (Get-Date).AddSeconds(5)
while (Test-AgentOffice $port) {
    if ((Get-Date) -gt $deadline) {
        Write-Host "The server on port $port did not stop." -ForegroundColor Red
        exit 1
    }
    Start-Sleep -Milliseconds 200
}
Write-Host 'agent-office-3d stopped.'
exit 0
