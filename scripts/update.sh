#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

echo "[SparkLab] Updating from ${SPARKLAB_FROM_VERSION:-unknown} to ${SPARKLAB_TO_VERSION:-unknown}"

echo "[SparkLab] Preparing backend"
cd "$ROOT_DIR/server"
go mod download
mkdir -p bin
go build -o bin/sparklab-server ./cmd/server

echo "[SparkLab] Preparing frontend"
cd "$ROOT_DIR/web"
npm ci
npm run build

cd "$ROOT_DIR"
if [[ -n "${SPARKLAB_RESTART_COMMAND:-}" ]]; then
  echo "[SparkLab] Running restart command"
  bash -lc "$SPARKLAB_RESTART_COMMAND"
else
  echo "[SparkLab] No restart command configured. Restart the SparkLab services manually."
fi

echo "[SparkLab] Update script finished"
