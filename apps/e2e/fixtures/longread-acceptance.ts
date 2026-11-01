import { randomUUID, scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { expect, request, type APIRequestContext, type Browser, type BrowserContext, type APIResponse } from '@playwright/test';
import type { LongreadDraft, SaveLongread } from '../../web/src/shared/api/longreads.js';

const password = 'Acceptance391!';
export type Actor = { api: APIRequestContext; context: BrowserContext; id: string };
export async function json<T>(pending: APIResponse | Promise<APIResponse>): Promise<T> {
  const response = await pending;
  expect(response.ok(), `${response.status()} ${await response.text()}`).toBe(true);
  const body = await response.json(); return body.data ?? body;
}
export function writable(draft: LongreadDraft): SaveLongread {
  return { revision: draft.revision, settings: draft.settings, chapters: draft.chapters.map(({ id, title, hidden, cover, blocks }) => ({ id, title, hidden, cover, blocks: blocks.map(({ id, type, title, hidden, schemaVersion, content }) => ({ id, type, title: title ?? null, hidden: hidden ?? false, schemaVersion, content })) })) };
}

/** Only provisioning/cleanup use Prisma. All authoring, publication and learning use the real HTTP API. No route interception. */
export async function acceptanceFixture(browser: Browser, baseURL: string) {
  const database = new URL(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/lms');
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || process.env.NODE_ENV !== 'test' || !/(?:^|[_-])test(?:$|[_-])/.test(database.pathname.slice(1)) || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(database.hostname)) {
    throw new Error('Longread acceptance requires NODE_ENV=test and an explicitly named local test database');
  }
  const db = new PrismaClient(), organizations: string[] = [], actors: Actor[] = [];
  async function cleanup() {
    try {
      for (const actor of actors) { await actor.context.close(); await actor.api.dispose(); }
      for (const organizationId of organizations) {
        const where = { organizationId };
        await db.assessmentAttemptAnswer.deleteMany({ where }); await db.assessmentAttempt.deleteMany({ where });
        await db.certificate.deleteMany({ where }); await db.progress.deleteMany({ where }); await db.assignment.deleteMany({ where });
        await db.course.deleteMany({ where }); await db.user.deleteMany({ where });
        await db.organization.delete({ where: { id: organizationId } });
      }
    } finally { await db.$disconnect(); }
  }
  try {
    const org = await db.organization.create({ data: { name: 'PR391 acceptance', slug: `lr391-${randomUUID()}`, longreadEnabled: true } }); organizations.push(org.id);
    const foreignOrg = await db.organization.create({ data: { name: 'PR391 foreign', slug: `lr391-${randomUUID()}`, longreadEnabled: true } }); organizations.push(foreignOrg.id);
    async function actor(role: 'admin' | 'learner', organizationId = org.id): Promise<Actor> {
      const salt = randomUUID();
      const user = await db.user.create({ data: { organizationId, email: `${randomUUID()}@example.test`, firstName: 'Acceptance', lastName: role, locale: 'ru', passwordHash: `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}` } });
      await db.membership.create({ data: { organizationId, userId: user.id, role } });
      const api = await request.newContext({ baseURL });
      const login = await json<{ accessToken: string }>(await api.post('/api/v1/auth/login', { data: { organizationId, email: user.email, password } }));
      const context = await browser.newContext({ baseURL, storageState: await api.storageState() });
      // Bearer-authenticated setup requests do not rely on browser-only CSRF headers.
      await api.dispose();
      const authenticated = await request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${login.accessToken}` } });
      const result = { api: authenticated, context, id: user.id }; actors.push(result); return result;
    }
    const author = await actor('admin'), first = await actor('learner'), second = await actor('learner'), foreign = await actor('admin', foreignOrg.id);
    const course = await db.course.create({ data: { organizationId: org.id, title: 'PR391 course', slug: `lr391-${randomUUID()}`, status: 'published' } });
    await db.assignment.createMany({ data: [first, second].map(({ id }) => ({ organizationId: org.id, userId: id, courseId: course.id })) });
    const lesson = await json<{ id: string }>(await author.api.post(`/api/v1/courses/${course.id}/lessons`, { data: { organizationId: org.id, courseId: course.id, title: 'PR391 longread', slug: `lr391-${randomUUID()}`, type: 'longread' } }));
    const root = `/api/v1/lessons/${lesson.id}/longread`;
    const draft = () => json<LongreadDraft>(author.api.get(root));
    const save = (data: unknown) => json<LongreadDraft>(author.api.put(root, { data }));
    // Storage/scan lifecycle is covered by longread-files.database.spec.ts. Here only already-scanned metadata is provisioned; no storage dependency or binary buffers.
    const document = await db.longreadDocument.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    const files = await json<{ id: string }[]>(await author.api.post(`${root}/files`, { data: { files: Array.from({ length: 20 }, (_, i) => ({ fileName: `guide-${i}.pdf`, mimeType: 'application/pdf', sizeBytes: 50 * 1024 * 1024 })) } }));
    for (const file of files) await db.courseMaterial.update({ where: { id: file.id }, data: { objectKey: `organizations/${org.id}/materials/${file.id}/guide.pdf`, scanStatus: 'available' } });
    return { db, org, course, lesson, document, root, author, first, second, foreign, files, draft, save, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
