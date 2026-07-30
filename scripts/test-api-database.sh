#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly COMPOSE_FILE="${REPO_ROOT}/infra/docker/docker-compose.test.yml"
readonly PROJECT_NAME="lms-api-db-test-${PPID}-$$"
readonly POSTGRES_PORT="${LMS_TEST_POSTGRES_PORT:-55432}"
readonly DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT}/lms_test?schema=public"

cleanup() {
  docker compose --project-name "${PROJECT_NAME}" --file "${COMPOSE_FILE}" down --volumes --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

command -v docker >/dev/null 2>&1 || {
  echo 'Docker is required for the disposable database integration test.' >&2
  exit 1
}

docker compose version >/dev/null 2>&1 || {
  echo 'Docker Compose is required for the disposable database integration test.' >&2
  exit 1
}

cd "${REPO_ROOT}"

echo 'Starting disposable PostgreSQL database...'
LMS_TEST_POSTGRES_PORT="${POSTGRES_PORT}" docker compose \
  --project-name "${PROJECT_NAME}" \
  --file "${COMPOSE_FILE}" \
  up --detach --wait postgres-test

echo 'Applying Prisma migrations to the disposable database...'
DATABASE_URL="${DATABASE_URL}" pnpm --filter @lms/api prisma:migrate:deploy

echo 'Running API database integration tests...'
DATABASE_URL="${DATABASE_URL}" pnpm --filter @lms/api test:integration:db

echo 'API database integration tests passed.'
