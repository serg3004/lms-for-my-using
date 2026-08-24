#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_COMPOSE="${ROOT_DIR}/infra/docker/docker-compose.prod.yml"
LOCAL_COMPOSE="${ROOT_DIR}/infra/docker/docker-compose.yml"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

export POSTGRES_PASSWORD=test-only
export DATABASE_URL=postgresql://lms_user:test-only@postgres:5432/lms
export JWT_SECRET=test-only-jwt-secret-at-least-32-characters
export METRICS_BEARER_TOKEN=test-only-metrics-token-at-least-32-characters

docker compose -f "${PROD_COMPOSE}" config --format json > "${TMP_DIR}/prod.json"
docker compose -f "${LOCAL_COMPOSE}" config --format json > "${TMP_DIR}/local.json"

node --input-type=module - "${TMP_DIR}/prod.json" "${TMP_DIR}/local.json" <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [prodPath, localPath] = process.argv.slice(2);
const prod = JSON.parse(readFileSync(prodPath, 'utf8'));
const local = JSON.parse(readFileSync(localPath, 'utf8'));
const expected = {
  postgres: { cpus: 1, memory: 1024 ** 3, reservedCpus: 0.25, reservedMemory: 256 * 1024 ** 2 },
  api: { cpus: 1, memory: 1024 ** 3, reservedCpus: 0.25, reservedMemory: 256 * 1024 ** 2 },
  web: { cpus: 0.5, memory: 256 * 1024 ** 2, reservedCpus: 0.1, reservedMemory: 64 * 1024 ** 2 },
};

for (const [name, values] of Object.entries(expected)) {
  const service = prod.services[name];
  assert.ok(service, `production service ${name} must exist`);
  assert.equal(service.restart, 'unless-stopped', `${name} restart policy`);
  assert.equal(Number(service.deploy.resources.limits.cpus), values.cpus, `${name} CPU limit`);
  assert.equal(Number(service.deploy.resources.limits.memory), values.memory, `${name} memory limit`);
  assert.equal(Number(service.deploy.resources.reservations.cpus), values.reservedCpus, `${name} CPU reservation`);
  assert.equal(Number(service.deploy.resources.reservations.memory), values.reservedMemory, `${name} memory reservation`);
}

assert.ok(prod.services.postgres.healthcheck, 'PostgreSQL healthcheck must remain configured');
assert.equal(prod.services.api.depends_on.postgres.condition, 'service_healthy');
assert.equal(local.services.postgres.deploy, undefined, 'local Compose must not inherit production limits');
assert.equal(local.services.minio.deploy, undefined, 'local MinIO must not inherit production limits');
NODE
