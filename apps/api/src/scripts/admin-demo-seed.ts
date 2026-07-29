import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PrismaClient } from '@prisma/client';

const DEMO_CONFIRMATION = 'demo-company';
const DEMO_IDS = {
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

export type AdminDemoSeedOptions = { apply: boolean };

export function parseAdminDemoSeedArgs(args: string[]): AdminDemoSeedOptions {
  const apply = args.includes('--apply');
  const confirmation = args.find((arg) => arg.startsWith('--confirm='))?.slice('--confirm='.length);

  if (apply && confirmation !== DEMO_CONFIRMATION) {
    throw new Error(`Apply requires --confirm=${DEMO_CONFIRMATION}`);
  }

  return { apply };
}

async function findMissingDemoData(prisma: PrismaClient): Promise<string[]> {
  const [organization, admin, learner, course, lessonOne, lessonTwo, lessonThree, assignment, assessment, questionCount] =
    await Promise.all([
      prisma.organization.findUnique({ where: { id: DEMO_IDS.organization }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: DEMO_IDS.admin }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: DEMO_IDS.learner }, select: { id: true } }),
      prisma.course.findUnique({ where: { id: DEMO_IDS.course }, select: { id: true } }),
      prisma.lesson.findUnique({ where: { id: DEMO_IDS.lessonOne }, select: { id: true } }),
      prisma.lesson.findUnique({ where: { id: DEMO_IDS.lessonTwo }, select: { id: true } }),
      prisma.lesson.findUnique({ where: { id: DEMO_IDS.lessonThree }, select: { id: true } }),
      prisma.assignment.findUnique({ where: { id: DEMO_IDS.assignment }, select: { id: true } }),
      prisma.assessment.findUnique({ where: { id: DEMO_IDS.assessment }, select: { id: true } }),
      prisma.assessmentQuestion.count({ where: { assessmentId: DEMO_IDS.assessment } }),
    ]);

  const requiredRecords = [
    ['organization', organization],
    ['admin user', admin],
    ['learner user', learner],
    ['course', course],
    ['lesson 1', lessonOne],
    ['lesson 2', lessonTwo],
    ['lesson 3', lessonThree],
    ['assignment', assignment],
    ['assessment', assessment],
  ] as const;

  const missing = requiredRecords.filter(([, record]) => record === null).map(([label]) => label);

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

async function runExistingSeed(): Promise<void> {
  const seedPath = resolve(process.cwd(), 'prisma/seed.mjs');

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [seedPath], {
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(sanitizeError(stderr || `Seed exited with code ${code ?? 'unknown'}`)));
    });
  });
}

export async function runAdminDemoSeed(args: string[], prisma = new PrismaClient()): Promise<void> {
  const { apply } = parseAdminDemoSeedArgs(args);

  try {
    const missingBefore = await findMissingDemoData(prisma);

    if (!apply) {
      console.log(JSON.stringify({
        mode: 'check',
        status: missingBefore.length === 0 ? 'complete' : 'incomplete',
        missing: missingBefore,
      }));

      if (missingBefore.length > 0) {
        process.exitCode = 2;
      }
      return;
    }

    if (missingBefore.length === 0) {
      console.log(JSON.stringify({ mode: 'apply', status: 'already-complete', missing: [] }));
      return;
    }

    await runExistingSeed();

    const missingAfter = await findMissingDemoData(prisma);
    if (missingAfter.length > 0) {
      throw new Error(`Demo seed verification failed: ${missingAfter.join(', ')}`);
    }

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
