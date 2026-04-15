#!/usr/bin/env bash
# Kwanix — unified deploy script
# Usage: bash infrastructure/scripts/deploy.sh [staging|production]
# Run from the repo root on the VPS.
set -euo pipefail

ENV=${1:-production}

case "$ENV" in
  staging)
    COMPOSE_FILE="docker-compose.staging.yml"
    ENV_FILE=".env.staging"
    BRANCH="develop"
    ;;
  production)
    COMPOSE_FILE="docker-compose.prod.yml"
    ENV_FILE=".env.production"
    BRANCH="master"
    ;;
  *)
    echo "Usage: $0 [staging|production]"
    exit 1
    ;;
esac

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.example and fill in the values."
  exit 1
fi

echo "==> Ensuring swap is enabled (2 GB)"
if [ "$(swapon --show | wc -l)" -eq 0 ]; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -qxF '/swapfile none swap sw 0 0' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    Swap created and enabled."
else
  echo "    Swap already active."
fi

echo "==> [$ENV] Pulling latest code from $BRANCH"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "==> [$ENV] Building images"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull

echo "==> [$ENV] Removing any stopped containers from a previous failed deploy"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" rm -f --stop 2>/dev/null || true

echo "==> [$ENV] Starting services"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans

API_PORT=$([ "$ENV" = "production" ] && echo "8100" || echo "8101")

echo "==> [$ENV] Waiting for API to be ready (port $API_PORT)"
HEALTHY=0
for i in $(seq 1 12); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" > /dev/null 2>&1; then
    echo "==> [$ENV] API is healthy"
    HEALTHY=1
    break
  fi
  echo "    attempt $i/12 — waiting 5s..."
  sleep 5
done

if [ "$HEALTHY" -eq 0 ]; then
  echo "ERROR: API did not become healthy after 60s. Check logs:"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs api --tail=30
  exit 1
fi

echo ""
echo "✓ $ENV deployed successfully."
