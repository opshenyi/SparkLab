$ErrorActionPreference = "Stop"

if ($env:APP_REPO_DIR) {
  $root = $env:APP_REPO_DIR
} else {
  $root = (git rev-parse --show-toplevel).Trim()
}

Set-Location -LiteralPath $root

function Invoke-Compose {
  param([string[]]$ComposeArgs)

  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if ($docker) {
    & docker compose version *> $null
    if ($LASTEXITCODE -eq 0) {
      & docker compose @ComposeArgs
      return
    }
  }

  $dockerCompose = Get-Command docker-compose -ErrorAction SilentlyContinue
  if ($dockerCompose) {
    & docker-compose @ComposeArgs
    return
  }

  throw "Docker Compose is not available"
}

try {
  git config --global --add safe.directory $root *> $null
} catch {
  # Git safe.directory is best-effort for bind-mounted repositories.
}

Write-Host "[SparkLab] Updating from $env:SPARKLAB_FROM_VERSION to $env:SPARKLAB_TO_VERSION"
Write-Host "[SparkLab] Repository: $root"

New-Item -ItemType Directory -Force -Path "data/server", "data/uploads", "data/web-uploads" | Out-Null

Write-Host "[SparkLab] Building Docker images"
Invoke-Compose @("build", "--pull")

$delay = if ($env:SPARKLAB_REDEPLOY_DELAY_SECONDS) { [int]$env:SPARKLAB_REDEPLOY_DELAY_SECONDS } else { 2 }
$logFile = if ($env:SPARKLAB_UPDATE_LOG) { $env:SPARKLAB_UPDATE_LOG } else { Join-Path $env:TEMP "sparklab-compose-update.log" }
$escapedRoot = $root.Replace("'", "''")
$escapedLog = $logFile.Replace("'", "''")
$composeCommand = "docker compose"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $composeCommand = "docker-compose"
} else {
  & docker compose version *> $null
  if ($LASTEXITCODE -ne 0) {
    $composeCommand = "docker-compose"
  }
}
$command = "Start-Sleep -Seconds $delay; Set-Location -LiteralPath '$escapedRoot'; $composeCommand up -d --remove-orphans --no-build *> '$escapedLog'; $composeCommand ps *>> '$escapedLog'"

Write-Host "[SparkLab] Scheduling Docker Compose redeploy in ${delay}s"
Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command -WindowStyle Hidden

Write-Host "[SparkLab] Redeploy scheduled. Follow progress with: docker compose logs -f"
Write-Host "[SparkLab] Background redeploy log: $logFile"
