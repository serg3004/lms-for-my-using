import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';

import { z } from 'zod';

const DEFAULT_API_PORT = 3000;
const DEFAULT_FRONTEND_URL = 'http://localhost:5173';
const JWT_SECRET_MIN_LENGTH = 32;
const LOCAL_ENV_FILES = ['.env', '.env.local'] as const;
const TRUST_PROXY_DISABLED = 'false';
const DEFAULT_RATE_LIMIT_NAMESPACE = 'lms';
const TRUST_PROXY_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal']);

type MutableEnv = Record<string, string | undefined>;

type LocalEnvLoadOptions = {
  cwd?: string;
  env?: MutableEnv;
  files?: readonly string[];
};

const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().url(),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_API_PORT),
    FRONTEND_URL: z.string().url().default(DEFAULT_FRONTEND_URL),
    JWT_SECRET: z.string().min(JWT_SECRET_MIN_LENGTH),
    REDIS_URL: z.string().url().optional(),
    BACKGROUND_JOBS_QUEUE: z.string().trim().min(1).max(80).default('lms-background-jobs'),
    BACKGROUND_JOBS_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
    BACKGROUND_JOBS_RUN_WORKER: z.enum(['true', 'false']).default('false'),
    RATE_LIMIT_NAMESPACE: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default(DEFAULT_RATE_LIMIT_NAMESPACE),
    ALLOW_IN_MEMORY_RATE_LIMIT: z.enum(['true']).optional(),
    SENTRY_DSN: z.string().url().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    TRUST_PROXY: z.string().trim().min(1).optional(),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && env.TRUST_PROXY === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUST_PROXY'],
        message: 'is required in production',
      });
    }
    if (env.NODE_ENV === 'production' && env.REDIS_URL === undefined && env.ALLOW_IN_MEMORY_RATE_LIMIT !== 'true') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: 'is required in production unless ALLOW_IN_MEMORY_RATE_LIMIT=true',
      });
    }
  });

export type TrustProxy = false | number | string[];
export type ApiEnv = Omit<z.infer<typeof apiEnvSchema>, 'TRUST_PROXY'> & { TRUST_PROXY: TrustProxy };

function isValidProxyAddress(value: string): boolean {
  if (TRUST_PROXY_NAMES.has(value)) {
    return true;
  }

  const [address, prefix, ...extra] = value.split('/');
  const ipVersion = address ? isIP(address) : 0;
  if (extra.length > 0 || ipVersion === 0) {
    return false;
  }

  if (prefix === undefined) {
    return true;
  }

  const maximumPrefix = ipVersion === 6 ? 128 : 32;
  return /^\d+$/.test(prefix) && Number(prefix) <= maximumPrefix;
}

export function parseTrustProxy(value: string | undefined): TrustProxy {
  if (value === undefined || value === TRUST_PROXY_DISABLED) {
    return false;
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const addresses = value.split(',').map((address) => address.trim());
  if (addresses.some((address) => !isValidProxyAddress(address))) {
    throw new Error('Invalid API environment: TRUST_PROXY: expected false, a hop count, or IP/CIDR list');
  }

  return addresses;
}

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

  return {
    ...parsedResult.data,
    TRUST_PROXY: parseTrustProxy(parsedResult.data.TRUST_PROXY),
  };
}

const jwtSecretSchema = z.string().min(JWT_SECRET_MIN_LENGTH);

export function getJwtSecret(env = process.env): string {
  const result = jwtSecretSchema.safeParse(env['JWT_SECRET']);

  if (!result.success) {
    throw new Error(`Invalid API environment: JWT_SECRET: ${result.error.issues[0]?.message ?? 'Invalid value'}`);
  }

  return result.data;
}
