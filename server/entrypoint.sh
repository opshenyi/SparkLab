#!/usr/bin/env sh
set -eu

repo_dir="${APP_REPO_DIR:-/app/repo}"

mkdir -p /app/data /app/uploads

if command -v git >/dev/null 2>&1 && [ -d "$repo_dir/.git" ]; then
  git config --global --add safe.directory "$repo_dir" >/dev/null 2>&1 || true
fi

if [ "${SEED_ON_START:-true}" = "true" ] && [ ! -f /app/data/.seeded ]; then
  echo "[SparkLab] Seeding initial database data"
  /app/sparklab-seed
  touch /app/data/.seeded
fi

exec /app/sparklab-server
