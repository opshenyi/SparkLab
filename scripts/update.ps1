$ErrorActionPreference = "Stop"

$root = (git rev-parse --show-toplevel).Trim()
Set-Location $root

Write-Host "[SparkLab] Updating from $env:SPARKLAB_FROM_VERSION to $env:SPARKLAB_TO_VERSION"

Write-Host "[SparkLab] Preparing backend"
Set-Location (Join-Path $root "server")
go mod download
New-Item -ItemType Directory -Force -Path "bin" | Out-Null
go build -o "bin\sparklab-server.exe" .\cmd\server

Write-Host "[SparkLab] Preparing frontend"
Set-Location (Join-Path $root "web")
npm ci
npm run build

Set-Location $root
if ($env:SPARKLAB_RESTART_COMMAND) {
  Write-Host "[SparkLab] Running restart command"
  powershell -NoProfile -ExecutionPolicy Bypass -Command $env:SPARKLAB_RESTART_COMMAND
} else {
  Write-Host "[SparkLab] No restart command configured. Restart the SparkLab services manually."
}

Write-Host "[SparkLab] Update script finished"
