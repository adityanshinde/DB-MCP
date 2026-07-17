<#
.SYNOPSIS
    Stops the DB-MCP server started by start-mcp.ps1.
.EXAMPLE
    ./stop-mcp.ps1             # stops the server on the default port (3939)
    ./stop-mcp.ps1 -Port 3000  # stops a server running on a custom port
#>
[CmdletBinding()]
param(
    [int]$Port = 3939
)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$pidFile = Join-Path $root '.mcp-server.pid'

$targets = @()

# 1) Whatever is actually listening on the port (the real node server).
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conns) {
    $targets += ($conns | Select-Object -ExpandProperty OwningProcess -Unique)
}

# 2) The launcher PID we saved at start.
if (Test-Path $pidFile) {
    $saved = Get-Content $pidFile | Select-Object -First 1
    if ($saved) { $targets += [int]$saved }
}

$targets = $targets | Where-Object { $_ -and $_ -ne 0 } | Select-Object -Unique

$stopped = $false
foreach ($procId in $targets) {
    # /T kills the whole tree (npm -> node), /F forces it.
    taskkill /PID $procId /T /F | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Stopped process tree PID $procId." -ForegroundColor Green
        $stopped = $true
    }
}

if (Test-Path $pidFile) { Remove-Item $pidFile -Force }

if (-not $stopped) {
    Write-Host "No DB-MCP server found running on port $Port." -ForegroundColor Yellow
}
