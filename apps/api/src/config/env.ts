import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

const DEFAULT_API_PORT = 3000;
const DEFAULT_FRONTEND_URL = 'http://localhost:5173';
const JWT_SECRET_MIN_LENGTH = 32;
const LOCAL_ENV_FILES = ['.env', '.env.local'] as const;

type MutableEnv = Record<string, string | undefined>;

type LocalEnvLoadOptions = {
  cwd?: string;
  env?: MutableEnv;
  files?: readonly string[];
};

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_API_PORT),
  FRONTEND_URL: z.string().url().default(DEFAULT_FRONTEND_URL),
  JWT_SECRET: z.string().min(JWT_SECRET_MIN_LENGTH),
  REDIS_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

function parseEnvLine(line: string): [string, string] | null {
  const trimmedLine = line.trim();

  if (!trimmedLine || trimmedLine.startsWith('#')) {
    return null;
  }

  const normalizedLine = trimmedLine.startsWith('export ') ? trimmedLine.slice('export '.length).trim() : trimmedLine;
  const separatorIndex = normalizedLine.indexOf('=');

  if (separatorIndex <= 0) {
    return null;
  }

  const key = normalizedLine.slice(0, separatorIndex).trim();
  const rawValue = normalizedLine.slice(separatorIndex + 1).trim();

  if (!key) {
    return null;
  }

  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return [key, rawValue.slice(1, -1)];
  }

  return [key, rawValue];
}

export function loadLocalEnvFiles({
  cwd = process.cwd(),
  env = process.env,
  files = LOCAL_ENV_FILES,
}: LocalEnvLoadOptions = {}): string[] {
  if (env.NODE_ENV === 'production' || env.CI) {
    return [];
  }

  const configuredKeys = new Set(Object.keys(env));
  const loadedFiles: string[] = [];

  for (const file of files) {
    const filePath = resolve(cwd, file);

    if (!existsSync(filePath)) {
      continue;
    }

    const fileContent = readFileSync(filePath, 'utf8');

    for (const line of fileContent.split(/\r?\n/)) {
      const parsedLine = parseEnvLine(line);

      if (!parsedLine) {
        continue;
      }

      const [key, value] = parsedLine;

      if (!configuredKeys.has(key)) {
        env[key] = value;
      }
    }

    loadedFiles.push(file);
  }

  return loadedFiles;
}

export function loadApiEnv(env = process.env): ApiEnv {
  // Railway injects PORT; map it to API_PORT so the schema picks it up
  const normalizedEnv: MutableEnv = { ...env };
  if (!normalizedEnv['API_PORT'] && normalizedEnv['PORT']) {
    normalizedEnv['API_PORT'] = normalizedEnv['PORT'];
  }

  const parsedResult = apiEnvSchema.safeParse(normalizedEnv);

  if (!parsedResult.success) {
    const message = parsedResult.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid API environment: ${message}`);
  }

  return parsedResult.data;
}

const jwtSecretSchema = z.string().min(JWT_SECRET_MIN_LENGTH);

export function getJwtSecret(env = process.env): string {
  const result = jwtSecretSchema.safeParse(env['JWT_SECRET']);

  if (!result.success) {
    throw new Error(`Invalid API environment: JWT_SECRET: ${result.error.issues[0]?.message ?? 'Invalid value'}`);
  }

  return result.data;
}
