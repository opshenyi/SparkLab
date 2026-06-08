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
      if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($ComposeArgs -join ' ') failed with exit code $LASTEXITCODE"
      }
      return
    }
  }

  $dockerCompose = Get-Command docker-compose -ErrorAction SilentlyContinue
  if ($dockerCompose) {
    & docker-compose @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
      throw "docker-compose $($ComposeArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
    return
  }

  throw "Docker Compose is not available"
}

function Set-HostProjectDir {
  if ($env:HOST_PROJECT_DIR) {
    return
  }
  if (-not (Test-Path "/.dockerenv")) {
    return
  }

  $containerId = $env:HOSTNAME
  if (-not $containerId) {
    $containerId = (hostname).Trim()
  }
  if (-not $containerId) {
    return
  }

  $hostDirOutput = & docker inspect $containerId --format '{{range .Mounts}}{{if eq .Destination "/app/repo"}}{{.Source}}{{end}}{{end}}' 2>$null
  $hostDir = $hostDirOutput | Select-Object -First 1
  if ($hostDir) {
    $hostDir = "$hostDir".Trim()
  }
  if ($LASTEXITCODE -eq 0 -and $hostDir) {
    $env:HOST_PROJECT_DIR = $hostDir
  }
}

try {
  git config --global --add safe.directory $root *> $null
} catch {
  # Git safe.directory is best-effort for bind-mounted repositories.
}

Set-HostProjectDir

Write-Host "[SparkLab] Updating from $env:SPARKLAB_FROM_VERSION to $env:SPARKLAB_TO_VERSION"
Write-Host "[SparkLab] Repository: $root"
if ($env:HOST_PROJECT_DIR) {
  Write-Host "[SparkLab] Host project directory: $env:HOST_PROJECT_DIR"
}

New-Item -ItemType Directory -Force -Path "data/server", "data/uploads", "data/web-uploads" | Out-Null

Write-Host "[SparkLab] Building Docker images"
$targetVersion = if ($env:SPARKLAB_TO_VERSION) { $env:SPARKLAB_TO_VERSION } else { "unknown" }
$targetCommit = if ($env:SPARKLAB_TARGET_COMMIT) { $env:SPARKLAB_TARGET_COMMIT } else { "unknown" }
$buildArgs = @("build")
if ($env:SPARKLAB_BUILD_PULL -and @("1", "true", "yes", "on") -contains $env:SPARKLAB_BUILD_PULL.ToLowerInvariant()) {
  $buildArgs += "--pull"
}
$buildArgs += "--build-arg"
$buildArgs += "SPARKLAB_VERSION=$targetVersion"
$buildArgs += "--build-arg"
$buildArgs += "SPARKLAB_COMMIT=$targetCommit"
Invoke-Compose -ComposeArgs $buildArgs

$delay = if ($env:SPARKLAB_REDEPLOY_DELAY_SECONDS) { [int]$env:SPARKLAB_REDEPLOY_DELAY_SECONDS } else { 2 }
$logFile = if ($env:SPARKLAB_UPDATE_LOG) { $env:SPARKLAB_UPDATE_LOG } else { Join-Path $env:TEMP "sparklab-compose-update.log" }
$statusFile = if ($env:SPARKLAB_UPDATE_STATUS_FILE) { $env:SPARKLAB_UPDATE_STATUS_FILE } else { "" }
$escapedRoot = $root.Replace("'", "''")
$escapedLog = $logFile.Replace("'", "''")
$escapedStatus = $statusFile.Replace("'", "''")
$escapedId = "$env:SPARKLAB_UPDATE_ID".Replace("'", "''")
$escapedRepo = "$env:GITHUB_REPO".Replace("'", "''")
$escapedBranch = "$(if ($env:GITHUB_BRANCH) { $env:GITHUB_BRANCH } else { 'main' })".Replace("'", "''")
$escapedFromVersion = "$env:SPARKLAB_FROM_VERSION".Replace("'", "''")
$escapedToVersion = "$targetVersion".Replace("'", "''")
$escapedTargetCommit = "$targetCommit".Replace("'", "''")
$composeCommand = "docker compose"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $composeCommand = "docker-compose"
} else {
  & docker compose version *> $null
  if ($LASTEXITCODE -ne 0) {
    $composeCommand = "docker-compose"
  }
}
$statusCommand = ""
if ($statusFile) {
  $statusCommand = @"
  `$now = (Get-Date).ToUniversalTime().ToString('o')
  `$payload = [ordered]@{
    id = '$escapedId'
    state = 'failed'
    message = 'Docker Compose redeploy failed. Check update log: $escapedLog'
    repo = '$escapedRepo'
    branch = '$escapedBranch'
    fromVersion = '$escapedFromVersion'
    toVersion = '$escapedToVersion'
    targetCommit = '$escapedTargetCommit'
    updatedAt = `$now
    completedAt = `$now
    error = 'Docker Compose redeploy failed. Check update log: $escapedLog'
    logPath = '$escapedLog'
    refreshRecommended = `$false
  }
  `$payload | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath '$escapedStatus'
"@
}
$command = @"
Start-Sleep -Seconds $delay
Set-Location -LiteralPath '$escapedRoot'
$composeCommand up -d --remove-orphans --no-build *> '$escapedLog'
if (`$LASTEXITCODE -ne 0) {
  $statusCommand
  exit `$LASTEXITCODE
}
$composeCommand ps *>> '$escapedLog'
"@

Write-Host "[SparkLab] Scheduling Docker Compose redeploy in ${delay}s"
Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command -WindowStyle Hidden

Write-Host "[SparkLab] Redeploy scheduled. Follow progress with: docker compose logs -f"
Write-Host "[SparkLab] Background redeploy log: $logFile"
