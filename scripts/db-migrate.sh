#!/usr/bin/env bash
# ARIA-V1 — run Flyway migrations standalone (without booting the full stack).
# Used by CI and the pnpm db:migrate script.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH; install Docker Desktop or docker-cli."
  exit 1
fi

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-aria_dev}"
POSTGRES_USER="${POSTGRES_USER:-aria}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-aria}"

JDBC_URL="jdbc:postgresql://${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

echo "Running Flyway migrations against ${JDBC_URL} as ${POSTGRES_USER}..."

docker run --rm \
  --network host \
  -v "$(pwd)/packages/db/flyway/migrations:/flyway/sql:ro" \
  flyway/flyway:10-alpine \
  -url="${JDBC_URL}" \
  -user="${POSTGRES_USER}" \
  -password="${POSTGRES_PASSWORD}" \
  -baselineOnMigrate=true \
  -connectRetries=20 \
  migrate

echo "Migrations applied."
