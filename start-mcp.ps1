<#
.SYNOPSIS
    Starts the DB-MCP HTTP server in the background on a fixed port.

    For Cursor / Grok local use, prefer stdio instead — the client launches
    `node dist/mcp-stdio.mjs` and you do not need this script.

.EXAMPLE
    ./start-mcp.ps1            # starts on the default port (3939)
    ./start-mcp.ps1 -Port 3000 # starts on a custom port
#>
[CmdletBinding()]
param(
    [int]$Port = 3939
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

$pidFile = Join-Path $root '.mcp-server.pid'
$logDir  = Join-Path $root 'logs'
$logFile = Join-Path $logDir 'mcp-server.log'
$errFile = Join-Path $logDir 'mcp-server.err.log'

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

# Already listening on this port? Don't start a second instance.
$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    $existingPid = ($existing | Select-Object -ExpandProperty OwningProcess -First 1)
    Write-Host "MCP server already listening on port $Port (PID $existingPid)." -ForegroundColor Yellow
    Write-Host "Endpoint: http://localhost:$Port/api/mcp" -ForegroundColor Yellow
    return
}

Write-Host "Starting DB-MCP on http://localhost:$Port/api/mcp ..." -ForegroundColor Cyan

$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { $npm = 'npm.cmd' }

$proc = Start-Process -FilePath $npm `
    -ArgumentList 'run', 'dev', '--', '-p', "$Port" `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError $errFile `
    -PassThru

$proc.Id | Out-File -FilePath $pidFile -Encoding ascii
Write-Host "Launched (launcher PID $($proc.Id))." -ForegroundColor Green
Write-Host "Logs:  $logFile" -ForegroundColor DarkGray
Write-Host "Ready in a few seconds at: http://localhost:$Port/api/mcp" -ForegroundColor Green
