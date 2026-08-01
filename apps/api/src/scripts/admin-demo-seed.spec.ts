/// <reference types="jest" />

import { jest } from '@jest/globals';

import { getSafeDatabaseTarget, parseAdminDemoSeedArgs, runAdminDemoSeed } from './admin-demo-seed';

const databaseUrl = 'postgresql://demo:super-secret@db.internal:5433/lms_demo?schema=demo';

function createPrisma(completeInitially = false) {
  let complete = completeInitially;
  const record = () => jest.fn(async () => complete ? { id: 'present' } : null);
  const prisma = {
    organization: { findUnique: record() },
    user: { findUnique: record() },
    course: { findUnique: record() },
    lesson: { findUnique: record() },
    assignment: { findUnique: record() },
    assessment: { findUnique: record() },
    assessmentQuestion: { count: jest.fn(async () => complete ? 5 : 0) },
    $disconnect: jest.fn(async () => undefined),
    $transaction: jest.fn(async (callback: (transaction: unknown) => Promise<void>) => {
      const before = complete;
      try {
        await callback(prisma);
      } catch (error) {
        complete = before;
        throw error;
      }
    }),
    markComplete: () => { complete = true; },
    isComplete: () => complete,
  };
  return prisma;
}

describe('admin demo seed safety', () => {
  let logSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('uses dry-run mode by default', () => {
    expect(parseAdminDemoSeedArgs([])).toEqual({ apply: false });
  });

  it('parses the exact environment and database confirmations', () => {
    expect(parseAdminDemoSeedArgs([
      '--apply',
      '--confirm-environment=development',
      '--confirm-database=lms_demo',
    ])).toEqual({
      apply: true,
      confirmedEnvironment: 'development',
      confirmedDatabase: 'lms_demo',
    });
  });

  it('rejects unknown and repeated arguments', () => {
    expect(() => parseAdminDemoSeedArgs(['--force'])).toThrow('Unknown argument');
    expect(() => parseAdminDemoSeedArgs(['--apply', '--apply'])).toThrow('must not be repeated');
  });

  it('builds a target summary without credentials or unrelated query values', () => {
    const target = getSafeDatabaseTarget(`${databaseUrl}&sslpassword=query-secret`, 'development');

    expect(target).toEqual({
      environment: 'development',
      host: 'db.internal',
      port: '5433',
      database: 'lms_demo',
      schema: 'demo',
    });
    expect(JSON.stringify(target)).not.toContain('super-secret');
    expect(JSON.stringify(target)).not.toContain('query-secret');
    expect(JSON.stringify(target)).not.toContain('demo@');
  });

  it('performs no mutations in default dry-run mode', async () => {
    const prisma = createPrisma();
    const seedDemo = jest.fn(async () => prisma.markComplete());

    await runAdminDemoSeed([], prisma as never, 'development', databaseUrl, seedDemo as never);

    expect(seedDemo).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$disconnect).toHaveBeenCalled();
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain('super-secret');
  });

  it('rejects production before reading or mutating the database', async () => {
    const prisma = createPrisma();

    await expect(runAdminDemoSeed([], prisma as never, 'production', databaseUrl)).rejects.toThrow(
      'disabled in production',
    );

    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires exact environment and database confirmations for apply', async () => {
    const prisma = createPrisma();

    await expect(runAdminDemoSeed(['--apply'], prisma as never, 'test', databaseUrl)).rejects.toThrow(
      '--confirm-environment=test',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('applies and verifies the seed in one transaction', async () => {
    const prisma = createPrisma();
    const seedDemo = jest.fn(async () => prisma.markComplete());

    await runAdminDemoSeed([
      '--apply',
      '--confirm-environment=test',
      '--confirm-database=lms_demo',
    ], prisma as never, 'test', databaseUrl, seedDemo as never);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(seedDemo).toHaveBeenCalledWith(prisma);
    expect(prisma.isComplete()).toBe(true);
  });

  it('is idempotent when demo data is already complete', async () => {
    const prisma = createPrisma(true);
    const seedDemo = jest.fn();

    await runAdminDemoSeed([
      '--apply',
      '--confirm-environment=test',
      '--confirm-database=lms_demo',
    ], prisma as never, 'test', databaseUrl, seedDemo as never);

    expect(seedDemo).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('already-complete'));
  });

  it('rolls back the transaction when seed verification fails', async () => {
    const prisma = createPrisma();
    const partialSeed = jest.fn(async () => undefined);

    await expect(runAdminDemoSeed([
      '--apply',
      '--confirm-environment=test',
      '--confirm-database=lms_demo',
    ], prisma as never, 'test', databaseUrl, partialSeed as never)).rejects.toThrow('verification failed');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.isComplete()).toBe(false);
  });
});
