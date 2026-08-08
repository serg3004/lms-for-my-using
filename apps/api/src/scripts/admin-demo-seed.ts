import { pathToFileURL } from 'node:url';

import { Prisma, PrismaClient } from '@prisma/client';

const APPLY_FLAG = '--apply';
const ALLOW_DEMO_ENVIRONMENT_FLAG = '--allow-demo-environment';
const CONFIRM_ENVIRONMENT_PREFIX = '--confirm-environment=';
const CONFIRM_DATABASE_PREFIX = '--confirm-database=';
const TRANSACTION_TIMEOUT_MS = 60_000;

export type AdminDemoSeedOptions = {
  apply: boolean;
  allowDemoEnvironment: boolean;
  confirmedEnvironment?: string;
  confirmedDatabase?: string;
};

export type SafeDatabaseTarget = {
  environment: string;
  host: string;
  port: string;
  database: string;
  schema: string;
};

type DemoSeedModule = {
  seedDemo(prisma: Prisma.TransactionClient): Promise<void>;
};

type SeedDemo = DemoSeedModule['seedDemo'];

export function parseAdminDemoSeedArgs(args: string[]): AdminDemoSeedOptions {
  const allowed = args.every((arg) =>
    arg === APPLY_FLAG
    || arg === ALLOW_DEMO_ENVIRONMENT_FLAG
    || arg.startsWith(CONFIRM_ENVIRONMENT_PREFIX)
    || arg.startsWith(CONFIRM_DATABASE_PREFIX));
  if (!allowed) {
    throw new Error('Unknown argument. Expected --apply, --allow-demo-environment, --confirm-environment, or --confirm-database');
  }

  const values = (prefix: string) => args.filter((arg) => arg.startsWith(prefix));
  const applyCount = args.filter((arg) => arg === APPLY_FLAG).length;
  const allowDemoEnvironmentCount = args.filter((arg) => arg === ALLOW_DEMO_ENVIRONMENT_FLAG).length;
  const environments = values(CONFIRM_ENVIRONMENT_PREFIX);
  const databases = values(CONFIRM_DATABASE_PREFIX);
  if (applyCount > 1 || allowDemoEnvironmentCount > 1 || environments.length > 1 || databases.length > 1) {
    throw new Error('Seed arguments must not be repeated');
  }

  return {
    apply: applyCount === 1,
    allowDemoEnvironment: allowDemoEnvironmentCount === 1,
    ...(environments[0]
      ? { confirmedEnvironment: environments[0].slice(CONFIRM_ENVIRONMENT_PREFIX.length) }
      : {}),
    ...(databases[0]
      ? { confirmedDatabase: databases[0].slice(CONFIRM_DATABASE_PREFIX.length) }
      : {}),
  };
}

export function getSafeDatabaseTarget(databaseUrl: string | undefined, environment: string): SafeDatabaseTarget {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol');
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!url.hostname || !database) {
    throw new Error('DATABASE_URL must include a host and database name');
  }

  return {
    environment,
    host: url.hostname,
    port: url.port || '5432',
    database,
    schema: url.searchParams.get('schema') || 'public',
  };
}

function assertEnvironmentAllowed(options: AdminDemoSeedOptions, target: SafeDatabaseTarget): void {
  if (target.environment === 'production' && !options.allowDemoEnvironment) {
    throw new Error(
      'Demo seed is disabled in production. Pass --allow-demo-environment only for a confirmed demo-only deployment.',
    );
  }
}

function assertSafeToApply(options: AdminDemoSeedOptions, target: SafeDatabaseTarget): void {
  if (options.confirmedEnvironment !== target.environment) {
    throw new Error(`Apply requires --confirm-environment=${target.environment}`);
  }
  if (options.confirmedDatabase !== target.database) {
    throw new Error(`Apply requires --confirm-database=${target.database}`);
  }
}

async function findMissingDemoData(prisma: Prisma.TransactionClient | PrismaClient): Promise<string[]> {
  const ids = {
    organization: '10000000-0000-4000-8000-000000000001',
    admin: '10000000-0000-4000-8000-000000000011',
    learner: '10000000-0000-4000-8000-000000000012',
    course: '10000000-0000-4000-8000-000000000031',
    lessonOne: '10000000-0000-4000-8000-000000000041',
    lessonTwo: '10000000-0000-4000-8000-000000000042',
    lessonThree: '10000000-0000-4000-8000-000000000043',
    assignment: '10000000-0000-4000-8000-000000000061',
    assessment: '10000000-0000-4000-8000-000000000081',
  } as const;
  const records = await Promise.all([
    prisma.organization.findUnique({ where: { id: ids.organization }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: ids.admin }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: ids.learner }, select: { id: true } }),
    prisma.course.findUnique({ where: { id: ids.course }, select: { id: true } }),
    prisma.lesson.findUnique({ where: { id: ids.lessonOne }, select: { id: true } }),
    prisma.lesson.findUnique({ where: { id: ids.lessonTwo }, select: { id: true } }),
    prisma.lesson.findUnique({ where: { id: ids.lessonThree }, select: { id: true } }),
    prisma.assignment.findUnique({ where: { id: ids.assignment }, select: { id: true } }),
    prisma.assessment.findUnique({ where: { id: ids.assessment }, select: { id: true } }),
  ]);
  const labels = ['organization', 'admin user', 'learner user', 'course', 'lesson 1', 'lesson 2', 'lesson 3', 'assignment', 'assessment'];
  const missing = labels.filter((_, index) => records[index] === null);
  const questionCount = await prisma.assessmentQuestion.count({ where: { assessmentId: ids.assessment } });
  if (questionCount !== 5) {
    missing.push(`assessment questions (expected 5, found ${questionCount})`);
  }
  return missing;
}

function sanitizeError(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'DATABASE_URL_REDACTED')
    .replace(/password\s*[:=]\s*[^\s]+/gi, 'password=REDACTED')
    .trim();
}

async function loadDemoSeed(): Promise<SeedDemo> {
  const seedUrl = new URL('../../prisma/seed.mjs', import.meta.url).href;
  const seedModule = await import(seedUrl) as DemoSeedModule;
  return seedModule.seedDemo;
}

export async function runAdminDemoSeed(
  args: string[],
  prisma = new PrismaClient(),
  environment = process.env.NODE_ENV || 'development',
  databaseUrl = process.env.DATABASE_URL,
  seedDemo?: SeedDemo,
): Promise<void> {
  try {
    const options = parseAdminDemoSeedArgs(args);
    const target = getSafeDatabaseTarget(databaseUrl, environment);
    console.log(JSON.stringify({ target, mode: options.apply ? 'apply' : 'dry-run' }));
    assertEnvironmentAllowed(options, target);

    const missingBefore = await findMissingDemoData(prisma);
    if (!options.apply) {
      console.log(JSON.stringify({ mode: 'dry-run', status: missingBefore.length === 0 ? 'complete' : 'incomplete', missing: missingBefore }));
      return;
    }

    assertSafeToApply(options, target);
    if (missingBefore.length === 0) {
      console.log(JSON.stringify({ mode: 'apply', status: 'already-complete', missing: [] }));
      return;
    }

    const applySeed = seedDemo ?? await loadDemoSeed();
    await prisma.$transaction(async (transaction) => {
      await applySeed(transaction);
      const missingAfter = await findMissingDemoData(transaction);
      if (missingAfter.length > 0) {
        throw new Error(`Demo seed verification failed: ${missingAfter.join(', ')}`);
      }
    }, { maxWait: TRANSACTION_TIMEOUT_MS, timeout: TRANSACTION_TIMEOUT_MS });
    console.log(JSON.stringify({ mode: 'apply', status: 'complete', restored: missingBefore }));
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  runAdminDemoSeed(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Admin demo seed failed: ${sanitizeError(message)}`);
    process.exitCode = 1;
  });
}
