# agent-office-3d hook: forwards one Claude Code hook event to the local server.
#
# Claude Code pipes the hook input JSON to stdin. This script sends those bytes unchanged to
# http://127.0.0.1:<port>/event and exits. Contract (see docs/DECISIONS.md D1-D5):
#   - never writes to stdout (stdout of some hooks is shown to Claude),
#   - exits 0 quietly and quickly when the server is not running,
#   - never parses or changes the event (the server does that).
# Compatible with Windows PowerShell 5.1. Keep this file ASCII-only.

$ErrorActionPreference = 'Stop'
$client = $null
try {
    # Process start time = the moment Claude Code fired this hook. Used by the server to restore
    # event order, because async hook processes finish in random order.
    $startedAt = [System.Diagnostics.Process]::GetCurrentProcess().StartTime
    $hookTs = ([DateTimeOffset]$startedAt).ToUnixTimeMilliseconds()

    $port = 7847
    if ($env:AGENT_OFFICE_PORT) { $port = [int]$env:AGENT_OFFICE_PORT }

    # Read stdin as raw bytes so UTF-8 survives (the console code page would mangle it).
    $stdin = [Console]::OpenStandardInput()
    $buffer = New-Object System.IO.MemoryStream
    $stdin.CopyTo($buffer)
    $body = $buffer.ToArray()
    if ($body.Length -eq 0) { exit 0 }

    # Short connect wait: a refused localhost connection can take seconds on Windows.
    $client = New-Object System.Net.Sockets.TcpClient
    $connect = $client.ConnectAsync('127.0.0.1', $port)
    if (-not $connect.Wait(300) -or -not $client.Connected) { exit 0 }

    $stream = $client.GetStream()
    $stream.WriteTimeout = 1000
    $stream.ReadTimeout = 1000
    $head = "POST /event HTTP/1.1`r`n" +
            "Host: 127.0.0.1:$port`r`n" +
            "Content-Type: application/json; charset=utf-8`r`n" +
            "Content-Length: $($body.Length)`r`n" +
            "X-Agent-Office: 1`r`n" +
            "X-Hook-Ts: $hookTs`r`n" +
            "Connection: close`r`n`r`n"
    $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($headBytes, 0, $headBytes.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Flush()

    # Wait for the status line so the server has the whole body before we close the socket.
    $null = $stream.Read((New-Object byte[] 64), 0, 64)
}
catch {
    # Server down, timeout, bad input: stay silent, never bother Claude.
}
finally {
    if ($client) { $client.Close() }
}
exit 0
