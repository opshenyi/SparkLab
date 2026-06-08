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

detect_host_project_dir() {
  if [[ -n "${HOST_PROJECT_DIR:-}" ]]; then
    return
  fi
  if [[ ! -f /.dockerenv ]]; then
    return
  fi

  local container_id="${HOSTNAME:-}"
  if [[ -z "$container_id" ]] && command -v hostname >/dev/null 2>&1; then
    container_id="$(hostname)"
  fi
  if [[ -z "$container_id" ]]; then
    return
  fi

  HOST_PROJECT_DIR="$(docker inspect "$container_id" --format '{{range .Mounts}}{{if eq .Destination "/app/repo"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
  if [[ -n "$HOST_PROJECT_DIR" ]]; then
    export HOST_PROJECT_DIR
  fi
}

detect_host_project_dir

git config --global --add safe.directory "$ROOT_DIR" >/dev/null 2>&1 || true

echo "[SparkLab] Updating from ${SPARKLAB_FROM_VERSION:-unknown} to ${SPARKLAB_TO_VERSION:-unknown}"
echo "[SparkLab] Repository: $ROOT_DIR"
if [[ -n "${HOST_PROJECT_DIR:-}" ]]; then
  echo "[SparkLab] Host project directory: $HOST_PROJECT_DIR"
fi

mkdir -p data/server data/uploads data/web-uploads

status_file="${SPARKLAB_UPDATE_STATUS_FILE:-}"
log_file="${SPARKLAB_UPDATE_LOG:-/tmp/sparklab-compose-update.log}"
target_version="${SPARKLAB_TO_VERSION:-unknown}"
target_commit="${SPARKLAB_TARGET_COMMIT:-unknown}"

json_escape() {
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  printf '%s' "$value"
}

write_failed_status() {
  if [[ -z "$status_file" ]]; then
    return
  fi

  local now
  now="$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')"
  local tmp="${status_file}.tmp"
  mkdir -p "$(dirname "$status_file")"
  cat >"$tmp" <<EOF
{
  "id": "$(json_escape "${SPARKLAB_UPDATE_ID:-}")",
  "state": "failed",
  "message": "Docker Compose redeploy failed. Check update log: $(json_escape "$log_file")",
  "repo": "$(json_escape "${GITHUB_REPO:-}")",
  "branch": "$(json_escape "${GITHUB_BRANCH:-main}")",
  "fromVersion": "$(json_escape "${SPARKLAB_FROM_VERSION:-}")",
  "toVersion": "$(json_escape "$target_version")",
  "targetCommit": "$(json_escape "$target_commit")",
  "updatedAt": "$(json_escape "$now")",
  "completedAt": "$(json_escape "$now")",
  "error": "Docker Compose redeploy failed. Check update log: $(json_escape "$log_file")",
  "logPath": "$(json_escape "$log_file")",
  "refreshRecommended": false
}
EOF
  mv "$tmp" "$status_file"
}

echo "[SparkLab] Building Docker images"
build_args=(build)
case "${SPARKLAB_BUILD_PULL:-false}" in
  1|true|TRUE|yes|YES|on|ON)
    build_args+=(--pull)
    ;;
esac
build_args+=(--build-arg "SPARKLAB_VERSION=$target_version")
build_args+=(--build-arg "SPARKLAB_COMMIT=$target_commit")
"${COMPOSE[@]}" "${build_args[@]}"

delay="${SPARKLAB_REDEPLOY_DELAY_SECONDS:-2}"

echo "[SparkLab] Scheduling Docker Compose redeploy in ${delay}s"
(
  sleep "$delay"
  cd "$ROOT_DIR"
  if ! "${COMPOSE[@]}" up -d --remove-orphans --no-build; then
    echo "[SparkLab] Docker Compose redeploy failed"
    write_failed_status
    exit 1
  fi
  "${COMPOSE[@]}" ps
) >"$log_file" 2>&1 &

echo "[SparkLab] Redeploy scheduled. Follow progress with: docker compose logs -f"
echo "[SparkLab] Background redeploy log: $log_file"
