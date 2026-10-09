# Shared helpers for start.ps1, stop.ps1, shortcut.ps1 and the installers. Dot-source it.
# Windows PowerShell 5.1. Keep this file ASCII-only.

$AgentOfficeRoot = Split-Path -Parent $PSScriptRoot

# Same order as the server and the hook (D14): env AGENT_OFFICE_PORT, "port" in config.json, 7847.
function Get-AgentOfficePort {
    if ($env:AGENT_OFFICE_PORT) { return [int]$env:AGENT_OFFICE_PORT }
    $configFile = Join-Path $AgentOfficeRoot 'config.json'
    if ($env:AGENT_OFFICE_CONFIG) { $configFile = [System.IO.Path]::Combine($AgentOfficeRoot, $env:AGENT_OFFICE_CONFIG) }
    if ([System.IO.File]::Exists($configFile)) {
        $found = [regex]::Match([System.IO.File]::ReadAllText($configFile), '"port"\s*:\s*(\d{4,5})\b')
        if ($found.Success) { return [int]$found.Groups[1].Value }
    }
    return 7847
}

function Get-AgentOfficeDataDir {
    if ($env:AGENT_OFFICE_DATA) { return [System.IO.Path]::Combine($AgentOfficeRoot, $env:AGENT_OFFICE_DATA) }
    return (Join-Path $AgentOfficeRoot 'data')
}

# A tiny HTTP request over a raw socket, like the hook (D5): no proxy lookup, short timeouts.
# Returns the whole reply (status line, headers, body) or $null when nobody answers.
function Invoke-AgentOffice([string]$Method, [string]$Path, [int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $connect = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $connect.Wait(500) -or -not $client.Connected) { return $null }
        $stream = $client.GetStream()
        $stream.ReadTimeout = 3000
        $stream.WriteTimeout = 3000
        $head = "$Method $Path HTTP/1.1`r`n" +
                "Host: 127.0.0.1:$Port`r`n" +
                "X-Agent-Office: 1`r`n" +
                "Content-Length: 0`r`n" +
                "Connection: close`r`n`r`n"
        $bytes = [System.Text.Encoding]::ASCII.GetBytes($head)
        $stream.Write($bytes, 0, $bytes.Length)
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
        return $reader.ReadToEnd()
    }
    catch { return $null }
    finally { $client.Close() }
}

# True when an agent-office-3d server (not some other program) answers on this port.
function Test-AgentOffice([int]$Port) {
    $reply = Invoke-AgentOffice 'GET' '/health' $Port
    return [bool]($reply -and $reply -match '"ok":true' -and $reply -match '"version"')
}

function Get-ShortcutPath([string]$Place, [string]$Dir) {
    if (-not $Dir) {
        if ($Place -eq 'startup') { $Dir = [Environment]::GetFolderPath('Startup') }
        else { $Dir = [Environment]::GetFolderPath('Desktop') }
    }
    return (Join-Path $Dir 'agent-office-3d.lnk')
}
