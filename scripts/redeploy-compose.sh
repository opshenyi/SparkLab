#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${SPARKLAB_REDEPLOY_ROOT_DIR:-}" ]]; then
  ROOT_DIR="$SPARKLAB_REDEPLOY_ROOT_DIR"
elif [[ -n "${APP_REPO_DIR:-}" ]]; then
  ROOT_DIR="$APP_REPO_DIR"
else
  ROOT_DIR="$(git rev-parse --show-toplevel)"
fi

cd "$ROOT_DIR"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "[SparkLab] Docker Compose is not available"
  exit 1
fi

target_version="${SPARKLAB_TO_VERSION:-unknown}"
target_commit="${SPARKLAB_TARGET_COMMIT:-unknown}"
status_file="${SPARKLAB_UPDATE_STATUS_FILE:-}"
log_file="${SPARKLAB_UPDATE_LOG:-/tmp/sparklab-compose-update.log}"

host_visible_path() {
  local path="${1:-}"
  if [[ -n "${HOST_PROJECT_DIR:-}" ]]; then
    case "$path" in
      /app/data/*)
        printf '%s/data/server/%s' "$HOST_PROJECT_DIR" "${path#/app/data/}"
        return
        ;;
      "$ROOT_DIR"/data/server/*)
        printf '%s/data/server/%s' "$HOST_PROJECT_DIR" "${path#"$ROOT_DIR"/data/server/}"
        return
        ;;
    esac
  fi
  printf '%s' "$path"
}

display_log_file="$(host_visible_path "$log_file")"

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
  "message": "Docker Compose redeploy failed. Check update log: $(json_escape "$display_log_file")",
  "repo": "$(json_escape "${GITHUB_REPO:-}")",
  "branch": "$(json_escape "${GITHUB_BRANCH:-main}")",
  "fromVersion": "$(json_escape "${SPARKLAB_FROM_VERSION:-}")",
  "toVersion": "$(json_escape "$target_version")",
  "targetCommit": "$(json_escape "$target_commit")",
  "updatedAt": "$(json_escape "$now")",
  "completedAt": "$(json_escape "$now")",
  "error": "Docker Compose redeploy failed. Check update log: $(json_escape "$display_log_file")",
  "logPath": "$(json_escape "$display_log_file")",
  "containerLogPath": "$(json_escape "$log_file")",
  "refreshRecommended": false
}
EOF
  mv "$tmp" "$status_file"
}

remove_stopped_service_containers() {
  local service id state name
  for service in backend web; do
    while IFS= read -r id; do
      [[ -n "$id" ]] || continue
      state="$(docker inspect "$id" --format '{{.State.Status}}' 2>/dev/null || true)"
      name="$(docker inspect "$id" --format '{{.Name}}' 2>/dev/null | sed 's#^/##' || true)"
      if [[ "$state" != "running" ]]; then
        echo "[SparkLab] Removing stale $service container ${name:-$id} ($state)"
        docker rm -f "$id" >/dev/null 2>&1 || true
      else
        echo "[SparkLab] Keeping running $service container ${name:-$id}"
      fi
    done < <(docker ps -aq \
      --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME:-}" \
      --filter "label=com.docker.compose.service=$service" 2>/dev/null || true)
  done
}

echo "[SparkLab] Redeploy runner started"
echo "[SparkLab] Repository: $ROOT_DIR"
echo "[SparkLab] Compose project: ${COMPOSE_PROJECT_NAME:-default}"
echo "[SparkLab] Target: $target_version ($target_commit)"

if "${COMPOSE[@]}" up -d --remove-orphans --no-build; then
  "${COMPOSE[@]}" ps -a
  exit 0
fi

echo "[SparkLab] First Docker Compose redeploy attempt failed"
"${COMPOSE[@]}" ps -a || true
remove_stopped_service_containers

echo "[SparkLab] Retrying Docker Compose redeploy after stale-container cleanup"
if "${COMPOSE[@]}" up -d --remove-orphans --no-build --force-recreate; then
  "${COMPOSE[@]}" ps -a
  exit 0
fi

echo "[SparkLab] Docker Compose redeploy failed after retry"
"${COMPOSE[@]}" ps -a || true
write_failed_status
exit 1
