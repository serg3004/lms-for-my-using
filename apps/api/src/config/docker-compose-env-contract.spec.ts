import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadApiEnv } from './env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');
const composeFile = resolve(repoRoot, 'infra/docker/docker-compose.prod.yml');

const REQUIRED_PLACEHOLDER_ENV = {
  POSTGRES_PASSWORD: 'test-postgres-password-0123456789',
  DATABASE_URL: 'postgresql://lms_user:test-postgres-password-0123456789@postgres:5432/lms',
  JWT_SECRET: '0123456789abcdef0123456789abcdef',
  METRICS_BEARER_TOKEN: '0123456789abcdef0123456789abcdef',
};

function hasDockerCompose(): boolean {
  try {
    execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function writeEnvFile(dir: string, entries: Record<string, string>): string {
  const path = join(dir, '.env');
  writeFileSync(path, Object.entries(entries).map(([key, value]) => `${key}=${value}`).join('\n'));
  return path;
}

// `docker compose` resolves `${VAR}` from the shell environment when the variable is
// absent from --env-file (shell env takes precedence over the file). CI jobs (see
// ci.yml) export DATABASE_URL for the whole job, so without stripping it here a test
// that omits DATABASE_URL from its temp .env would still "see" the CI job's value and
// fail to reproduce the missing-variable scenario it's meant to test.
const MANAGED_ENV_KEYS = ['POSTGRES_PASSWORD', 'DATABASE_URL', 'JWT_SECRET', 'METRICS_BEARER_TOKEN', 'REDIS_URL'] as const;

function isolatedShellEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of MANAGED_ENV_KEYS) delete env[key];
  return env;
}

function resolveComposeApiEnvironment(envFilePath: string): Record<string, string> {
  const output = execFileSync(
    'docker',
    ['compose', '-f', composeFile, '--env-file', envFilePath, 'config', '--format', 'json'],
    { encoding: 'utf8', env: isolatedShellEnv() },
  );
  const config = JSON.parse(output) as { services: { api: { environment: Record<string, string> } } };
  return config.services.api.environment;
}

// This suite catches drift between infra/docker/docker-compose.prod.yml and the real
// apps/api/src/config/env.ts production contract: it resolves the actual Compose file
// with `docker compose config` (not a hand-rolled YAML parser) and feeds the result
// into the real loadApiEnv() validator. If a future change to env.ts adds a new
// production-required variable without updating the Compose file, or vice versa, the
// happy-path assertion below fails immediately.
(hasDockerCompose() ? describe : describe.skip)('production Docker Compose ↔ API env contract', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lms-docker-env-contract-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('docker compose config resolves a production-like .env without error', () => {
    const envFilePath = writeEnvFile(tempDir, REQUIRED_PLACEHOLDER_ENV);
    expect(() => resolveComposeApiEnvironment(envFilePath)).not.toThrow();
  });

  it('loadApiEnv accepts the environment Compose resolves for the api service', () => {
    const envFilePath = writeEnvFile(tempDir, REQUIRED_PLACEHOLDER_ENV);
    const resolvedEnv = resolveComposeApiEnvironment(envFilePath);

    expect(() => loadApiEnv(resolvedEnv)).not.toThrow();

    const apiEnv = loadApiEnv(resolvedEnv);
    expect(apiEnv.NODE_ENV).toBe('production');
    expect(apiEnv.REDIS_URL).toBeUndefined();
    expect(apiEnv.ALLOW_IN_MEMORY_RATE_LIMIT).toBe('true');
    expect(apiEnv.METRICS_BEARER_TOKEN).toBe(REQUIRED_PLACEHOLDER_ENV.METRICS_BEARER_TOKEN);
  });

  it('loadApiEnv accepts the environment Compose resolves when an operator opts into Redis', () => {
    const envFilePath = writeEnvFile(tempDir, {
      ...REQUIRED_PLACEHOLDER_ENV,
      REDIS_URL: 'redis://redis:6379',
    });
    const resolvedEnv = resolveComposeApiEnvironment(envFilePath);

    const apiEnv = loadApiEnv(resolvedEnv);
    expect(apiEnv.REDIS_URL).toBe('redis://redis:6379');
  });

  it('fails fast at `docker compose config` time when METRICS_BEARER_TOKEN is not set', () => {
    const withoutMetricsToken = { ...REQUIRED_PLACEHOLDER_ENV };
    delete (withoutMetricsToken as Partial<typeof REQUIRED_PLACEHOLDER_ENV>).METRICS_BEARER_TOKEN;
    const envFilePath = writeEnvFile(tempDir, withoutMetricsToken);

    expect(() => resolveComposeApiEnvironment(envFilePath)).toThrow(/METRICS_BEARER_TOKEN/);
  });

  it('fails fast at `docker compose config` time when DATABASE_URL is not set', () => {
    const withoutDatabaseUrl = { ...REQUIRED_PLACEHOLDER_ENV };
    delete (withoutDatabaseUrl as Partial<typeof REQUIRED_PLACEHOLDER_ENV>).DATABASE_URL;
    const envFilePath = writeEnvFile(tempDir, withoutDatabaseUrl);

    expect(() => resolveComposeApiEnvironment(envFilePath)).toThrow(/DATABASE_URL/);
  });
});
