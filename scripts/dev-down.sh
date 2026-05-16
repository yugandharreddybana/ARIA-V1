#!/usr/bin/env bash
# ARIA-V1 — stop stack
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${1:-}" = "--wipe" ]; then
  echo "Stopping and wiping volumes..."
  docker compose down -v --remove-orphans
else
  echo "Stopping (volumes preserved)..."
  docker compose down --remove-orphans
fi
