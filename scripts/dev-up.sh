#!/usr/bin/env bash
# ARIA-V1 — full local bring-up
set -euo pipefail

cd "$(dirname "$0")/.."

# 1) Ensure JWT keypair exists
if [ ! -f keys/jwt-private.pem ] || [ ! -f keys/jwt-public.pem ]; then
  echo "Generating RS256 JWT keypair..."
  bash scripts/generate-keys.sh
fi

# 2) Ensure .env.local exists
if [ ! -f .env.local ]; then
  echo "Creating .env.local from .env.example..."
  cp .env.example .env.local

  # Inject generated keys into .env.local (preserve newlines)
  PRIV=$(awk 'BEGIN{ORS="\\n"} {print}' keys/jwt-private.pem | sed 's/\\n$//')
  PUB=$(awk  'BEGIN{ORS="\\n"} {print}' keys/jwt-public.pem  | sed 's/\\n$//')
  sed -i "s|JWT_PRIVATE_KEY=\"\"|JWT_PRIVATE_KEY=\"${PRIV}\"|" .env.local
  sed -i "s|JWT_PUBLIC_KEY=\"\"|JWT_PUBLIC_KEY=\"${PUB}\"|"    .env.local
fi

# 3) Compose up
echo "Starting docker-compose stack..."
set -a
# shellcheck disable=SC1091
. ./.env.local
set +a
docker compose --env-file .env.local up -d --build

echo ""
echo "All services starting. Health endpoints:"
echo "  postgres   : docker exec aria-postgres pg_isready"
echo "  redis      : docker exec aria-redis redis-cli ping"
echo "  ollama     : curl http://localhost:11434/api/tags"
echo "  backend    : curl http://localhost:8080/api/health"
echo "  middleware : curl http://localhost:3001/api/health"
echo "  web        : http://localhost:3000"
