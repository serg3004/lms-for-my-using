/**
 * MVP smoke test — verifies the full learner flow against a running API.
 *
 * Usage:
 *   BASE_URL=https://<api-url>/api/v1 node dist/scripts/smoke-test.js
 *
 * Uses demo-company seed data: admin@demo.com / learner@demo.com / Demo1234!
 */

const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:3000/api/v1';
const ORG_ID = 'demo-company';
const ADMIN_EMAIL = 'admin@demo.com';
const LEARNER_EMAIL = 'learner@demo.com';
const PASSWORD = 'Demo1234!';

type AnyRecord = Record<string, unknown>;

let passed = 0;
let failed = 0;
let adminCookies = '';
let learnerCookies = '';

function ok(label: string) {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label: string, detail?: unknown) {
  console.error(`  ✗  ${label}`);
  if (detail !== undefined) console.error('     ', detail);
  failed++;
}

async function request(
  path: string,
  options: RequestInit & { cookies?: string } = {},
): Promise<{ status: number; body: unknown; setCookies: string[] }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.cookies) {
    headers['Cookie'] = options.cookies;

    const csrf = options.cookies
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('lms_csrf_token='))
      ?.split('=')[1];

    if (csrf && options.method && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(options.method)) {
      headers['x-csrf-token'] = decodeURIComponent(csrf);
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    body = text;
  }

  const setCookies = (res.headers.getSetCookie?.() ?? []) as string[];
  return { status: res.status, body, setCookies };
}

function extractCookies(setCookies: string[]): string {
  return setCookies
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

function getField(body: unknown, ...keys: string[]): unknown {
  let obj = body as AnyRecord;
  for (const key of keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    obj = (obj as AnyRecord)[key] as AnyRecord;
  }
  return obj;
}

async function section(title: string, fn: () => Promise<void>) {
  console.log(`\n── ${title}`);
  await fn();
}

async function run() {
  console.log(`\nMVP Smoke Test`);
  console.log(`BASE_URL: ${BASE_URL}\n`);

  await section('Health', async () => {
    const { status, body } = await request('/health');
    if (status === 200 && (body as AnyRecord)?.['status'] === 'ok') ok('GET /health → ok');
    else fail('GET /health', { status, body });
  });

  let adminOrgId = '';

  await section('Admin login', async () => {
    const { status, body, setCookies } = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ organizationId: ORG_ID, email: ADMIN_EMAIL, password: PASSWORD }),
    });
    if (status === 200 || status === 201) {
      adminCookies = extractCookies(setCookies);
      adminOrgId = (getField(body, 'user', 'organizationId') as string) ?? '';
      ok(`POST /auth/login as admin → user.organizationId=${adminOrgId.slice(0, 8)}…`);
    } else fail('POST /auth/login as admin', { status, body });
  });

  await section('Admin — course & lesson check', async () => {
    const { status, body } = await request('/courses', { cookies: adminCookies });
    const courses = (body as AnyRecord[]) ?? [];
    if (status === 200 && Array.isArray(courses) && courses.length > 0) {
      ok(`GET /courses → ${courses.length} course(s)`);
    } else fail('GET /courses', { status, count: Array.isArray(courses) ? courses.length : 0 });
  });

  let courseId = '';
  let lessonIds: string[] = [];
  let assessmentId = '';

  await section('Learner login', async () => {
    const { status, body, setCookies } = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ organizationId: ORG_ID, email: LEARNER_EMAIL, password: PASSWORD }),
    });
    if (status === 200 || status === 201) {
      learnerCookies = extractCookies(setCookies);
      ok('POST /auth/login as learner');
    } else fail('POST /auth/login as learner', { status, body });
  });

  await section('Course discovery', async () => {
    const { status, body } = await request('/courses', { cookies: learnerCookies });
    const courses = body as AnyRecord[];
    if (status === 200 && Array.isArray(courses) && courses.length > 0) {
      courseId = (courses[0] as AnyRecord)['id'] as string;
      ok(`GET /courses → found "${(courses[0] as AnyRecord)['title']}" id=${courseId.slice(0, 8)}…`);
    } else fail('GET /courses as learner', { status });
  });

  await section('Lesson discovery', async () => {
    if (!courseId) { fail('Skipped — no courseId'); return; }
    const { status, body } = await request(`/courses/${courseId}/lessons`, { cookies: learnerCookies });
    const lessons = body as AnyRecord[];
    if (status === 200 && Array.isArray(lessons)) {
      lessonIds = lessons.map((l) => (l as AnyRecord)['id'] as string);
      ok(`GET /courses/:id/lessons → ${lessons.length} lesson(s)`);
      if (lessons.length === 3) ok('Lesson count is exactly 3 (matches demo seed)');
      else fail(`Expected 3 lessons, got ${lessons.length}`);
    } else fail('GET /courses/:id/lessons', { status });
  });

  await section('Lesson completion (lessons 2 & 3)', async () => {
    if (!courseId || lessonIds.length < 3) { fail('Skipped — missing course/lesson IDs'); return; }

    const learnerMe = await request('/auth/me', { cookies: learnerCookies });
    const userId = (getField(learnerMe.body, 'id') as string) ?? '';

    for (const lessonId of lessonIds.slice(1)) {
      const { status } = await request('/progress', {
        method: 'POST',
        cookies: learnerCookies,
        body: JSON.stringify({
          organizationId: adminOrgId,
          courseId,
          lessonId,
          userId,
          status: 'completed',
          completedAt: new Date().toISOString(),
        }),
      });
      if (status === 200 || status === 201) ok(`POST /progress lesson ${lessonId.slice(0, 8)}… → completed`);
      else fail(`POST /progress for lesson ${lessonId.slice(0, 8)}…`, { status });
    }
  });

  await section('Assessment discovery', async () => {
    const { status, body } = await request('/assessments', { cookies: learnerCookies });
    const assessments = body as AnyRecord[];
    if (status === 200 && Array.isArray(assessments) && assessments.length > 0) {
      assessmentId = (assessments[0] as AnyRecord)['id'] as string;
      ok(`GET /assessments → found "${(assessments[0] as AnyRecord)['title']}" id=${assessmentId.slice(0, 8)}…`);
    } else fail('GET /assessments', { status });
  });

  await section('Take assessment (all correct answers)', async () => {
    if (!assessmentId) { fail('Skipped — no assessmentId'); return; }

    const { status: qStatus, body: qBody } = await request(
      `/assessments/${assessmentId}/quiz`,
      { cookies: learnerCookies },
    );

    if (qStatus !== 200 || !Array.isArray(qBody)) {
      fail('GET /assessments/:id/quiz as learner', { status: qStatus });
      return;
    }

    const learnerQuestions = qBody as AnyRecord[];
    ok(`GET /assessments/:id/quiz as learner → ${learnerQuestions.length} question(s)`);
    if (learnerQuestions.length === 5) ok('Question count is exactly 5 (matches demo seed)');

    const leaksCorrectAnswer = learnerQuestions.some((question) =>
      Array.isArray((question as AnyRecord)['options']) &&
      ((question as AnyRecord)['options'] as AnyRecord[]).some((option) => 'isCorrect' in option),
    );
    if (!leaksCorrectAnswer) ok('Learner quiz response does not expose isCorrect');
    else fail('Learner quiz response exposes isCorrect');

    const { status: adminQStatus, body: adminQBody } = await request(
      `/assessments/${assessmentId}/questions`,
      { cookies: adminCookies },
    );

    if (adminQStatus !== 200 || !Array.isArray(adminQBody)) {
      fail('GET /assessments/:id/questions as admin', { status: adminQStatus });
      return;
    }

    const questions = adminQBody as AnyRecord[];

    // Build answers: the smoke script uses admin-only data as an answer key,
    // while the learner-facing quiz endpoint stays safe.
    const answers: AnyRecord[] = [];
    for (const q of questions) {
      const qId = (q as AnyRecord)['id'] as string;
      const { status: oStatus, body: oBody } = await request(
        `/questions/${qId}/options`,
        { cookies: adminCookies },
      );
      if (oStatus !== 200 || !Array.isArray(oBody)) {
        fail(`GET /questions/${qId.slice(0, 8)}…/options`, { status: oStatus });
        return;
      }
      const correctOption = (oBody as AnyRecord[]).find((o) => (o as AnyRecord)['isCorrect']);
      if (!correctOption) { fail(`No correct option for question ${qId.slice(0, 8)}…`); return; }
      answers.push({ questionId: qId, selectedOptionId: (correctOption as AnyRecord)['id'] });
    }

    const { status: attemptStatus, body: attemptBody } = await request(
      `/assessments/${assessmentId}/attempts`,
      {
        method: 'POST',
        cookies: learnerCookies,
        body: JSON.stringify({ answers }),
      },
    );

    if (attemptStatus !== 200 && attemptStatus !== 201) {
      fail('POST /assessments/:id/attempts', { status: attemptStatus, body: attemptBody });
      return;
    }

    const attemptId = (getField(attemptBody, 'id') as string) ?? '';
    ok(`POST /assessments/:id/attempts → attempt id=${attemptId.slice(0, 8)}…`);

    const { status: rStatus, body: rBody } = await request(
      `/attempts/${attemptId}/result`,
      { cookies: learnerCookies },
    );

    if (rStatus !== 200) { fail('GET /attempts/:id/result', { status: rStatus }); return; }

    const percentage = getField(rBody, 'percentage') as number;
    const passed2 = getField(rBody, 'passed') as boolean;
    ok(`GET /attempts/:id/result → ${percentage}% — ${passed2 ? 'PASSED' : 'FAILED'}`);
    if (passed2) ok('Assessment passed (all correct answers)');
    else fail('Expected assessment to be passed with all correct answers');
  });

  await section('Certificate issued', async () => {
    const { status, body } = await request('/certificates', { cookies: learnerCookies });
    const certs = body as AnyRecord[];
    if (status === 200 && Array.isArray(certs) && certs.length > 0) {
      ok(`GET /certificates → ${certs.length} certificate(s) for learner`);
    } else fail('GET /certificates', { status, count: Array.isArray(certs) ? certs.length : 0 });
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(48)}`);
  console.log(`  Passed: ${passed}   Failed: ${failed}`);
  console.log(`${'─'.repeat(48)}\n`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  console.error('Smoke test crashed:', error);
  process.exitCode = 1;
});
