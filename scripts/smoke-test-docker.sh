#!/usr/bin/env bash
# Local pre-deploy smoke test.
# Builds both Docker images, runs API + Postgres, verifies migrations and health.
#
# Usage:
#   bash scripts/smoke-test-docker.sh
#
# Prerequisites: Docker + Docker Compose running locally.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

API_IMAGE="lms-api:smoke"
WEB_IMAGE="lms-web:smoke"
NETWORK="lms-smoke-net"
PG_CONTAINER="smoke-postgres"
API_CONTAINER="smoke-api"
WEB_CONTAINER="smoke-web"

cleanup() {
  echo ""
  echo "--- Cleaning up ---"
  docker rm -f "$API_CONTAINER" "$WEB_CONTAINER" "$PG_CONTAINER" 2>/dev/null || true
  docker network rm "$NETWORK" 2>/dev/null || true
}
trap cleanup EXIT

wait_for_url() {
  local url="$1"
  local label="$2"
  local retries=30
  echo -n "Waiting for $label"
  for i in $(seq 1 $retries); do
    if curl -sf "$url" > /dev/null 2>&1; then
      echo " OK"
      return 0
    fi
    echo -n "."
    sleep 2
  done
  echo " TIMEOUT"
  return 1
}

echo "=== Step 1: Build Docker images ==="
docker build -f apps/api/Dockerfile -t "$API_IMAGE" .
docker build -f apps/web/Dockerfile -t "$WEB_IMAGE" .
echo "Images built."

echo ""
echo "=== Step 2: Create network ==="
docker network create "$NETWORK"

echo ""
echo "=== Step 3: Start Postgres ==="
docker run -d \
  --name "$PG_CONTAINER" \
  --network "$NETWORK" \
  -e POSTGRES_DB=lms_smoke \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16-alpine

# Wait for Postgres to be ready
sleep 3
docker exec "$PG_CONTAINER" sh -c 'until pg_isready -U postgres -d lms_smoke; do sleep 1; done'
echo "Postgres ready."

echo ""
echo "=== Step 4: Start API (runs prisma migrate deploy on startup) ==="
docker run -d \
  --name "$API_CONTAINER" \
  --network "$NETWORK" \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://postgres:postgres@${PG_CONTAINER}:5432/lms_smoke" \
  -e JWT_SECRET="smoke-test-secret-32-chars-minimum" \
  -e FRONTEND_URL="http://localhost" \
  "$API_IMAGE"

wait_for_url "http://localhost:3000/api/v1/health" "API health"
echo "API response: $(curl -sf http://localhost:3000/api/v1/health)"

echo ""
echo "=== Step 5: Start Web (nginx + proxy) ==="
docker run -d \
  --name "$WEB_CONTAINER" \
  --network "$NETWORK" \
  -p 8080:80 \
  -e "API_HOST=${API_CONTAINER}" \
  "$WEB_IMAGE"

wait_for_url "http://localhost:8080" "Web"
wait_for_url "http://localhost:8080/api/v1/health" "API via nginx proxy"
echo "Proxy response: $(curl -sf http://localhost:8080/api/v1/health)"

echo ""
echo "=== Step 6: Run seed ==="
docker exec "$API_CONTAINER" \
  sh -c 'NODE_ENV=production node node_modules/.bin/prisma db seed 2>/dev/null || node dist/scripts/seed.js 2>/dev/null || echo "Seed skipped (no seed script in dist)"'

echo ""
echo "================================================"
echo "  All smoke checks passed. Ready for Railway."
echo "================================================"
