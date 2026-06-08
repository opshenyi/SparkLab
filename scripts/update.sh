#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${APP_REPO_DIR:-}" ]]; then
  ROOT_DIR="$APP_REPO_DIR"
else
  ROOT_DIR="$(git rev-parse --show-toplevel)"
fi

cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "[SparkLab] Docker CLI is not available"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "[SparkLab] Docker Compose is not available"
  exit 1
fi

git config --global --add safe.directory "$ROOT_DIR" >/dev/null 2>&1 || true

echo "[SparkLab] Updating from ${SPARKLAB_FROM_VERSION:-unknown} to ${SPARKLAB_TO_VERSION:-unknown}"
echo "[SparkLab] Repository: $ROOT_DIR"

mkdir -p data/server data/uploads data/web-uploads

echo "[SparkLab] Building Docker images"
"${COMPOSE[@]}" build --pull

log_file="${SPARKLAB_UPDATE_LOG:-/tmp/sparklab-compose-update.log}"
delay="${SPARKLAB_REDEPLOY_DELAY_SECONDS:-2}"

echo "[SparkLab] Scheduling Docker Compose redeploy in ${delay}s"
(
  sleep "$delay"
  cd "$ROOT_DIR"
  "${COMPOSE[@]}" up -d --remove-orphans --no-build
  "${COMPOSE[@]}" ps
) >"$log_file" 2>&1 &

echo "[SparkLab] Redeploy scheduled. Follow progress with: docker compose logs -f"
echo "[SparkLab] Background redeploy log: $log_file"
