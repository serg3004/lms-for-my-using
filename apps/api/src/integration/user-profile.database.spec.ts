/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 496: a person edits only their allowed profile fields; the photo is visible to the owner and to those who may read the user.
const PASSWORD = 'Prof1!Prof1Pass';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe('own profile — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  const storage = new Map<string, Buffer>();

  async function createUser(label: string, role: 'learner' | 'admin' | 'manager') {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { organizationId, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'Person' } });
    await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
    return { id: user.id, email };
  }

  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}/api/v1${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  async function headersFor(email: string) {
    const response = await send('POST', '/auth/login', { organizationId, email, password: PASSWORD });
    const body = (await response.json()) as { accessToken?: string; data?: { accessToken: string } };
    return { authorization: `Bearer ${body.accessToken ?? body.data?.accessToken}` };
  }
  const unwrap = async <T,>(response: Response) => {
    const body = (await response.json()) as T & { data?: T };
    return (body.data ?? body) as T;
  };
  function photoForm() {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'me.png');
    return form;
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'database-smoke-jwt-secret-32-characters';
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module.js');
    const { PrismaService: Prisma } = await import('../database/prisma.service.js');
    const { UploadService } = await import('../modules/upload/public.js');
    const { ApiExceptionFilter } = await import('../common/filters/api-exception.filter.js');
    // An in-memory storage stands in for the S3 bucket.
    const fakeStorage = {
      uploadUserPhoto: async (file: Express.Multer.File, org: string, user: string) => { const key = `${org}/${user}/${randomUUID()}`; storage.set(key, file.buffer); return key; },
      getObjectBytes: async (key: string) => storage.get(key) ?? null,
      deleteObject: async (key: string) => { storage.delete(key); },
    };
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(UploadService).useValue(fakeStorage).compile();
    app = testingModule.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(Prisma);
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Profile ${runId}`, slug: `profile-${runId}` } })).id;
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.auditLog.deleteMany({ where: { organizationId } });
        await prisma.managerGroup.deleteMany({ where: { organizationId } });
        await prisma.groupMember.deleteMany({ where: { organizationId } });
        await prisma.group.deleteMany({ where: { organizationId } });
        await prisma.user.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
    } finally {
      await app?.close();
    }
  });

  it('changes the allowed fields, refuses the forbidden ones and answers 409 for an outdated version', async () => {
    const worker = await createUser('worker', 'learner');
    const headers = await headersFor(worker.email);

    const initial = await unwrap<{ version: number; aboutMe: string | null }>(await send('GET', '/auth/me/profile', undefined, headers));
    expect(initial).toMatchObject({ version: 0, aboutMe: null });

    const saved = await send('PATCH', '/auth/me/profile', { version: 0, phone: '+7 701 123 45 67', timezone: 'Asia/Almaty', aboutMe: 'Кладовщик', locale: 'kk' }, headers);
    expect(saved.status).toBe(200);
    expect(await unwrap(saved)).toMatchObject({ version: 1, phone: '+7 701 123 45 67', aboutMe: 'Кладовщик', locale: 'kk' });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: worker.id } })).toMatchObject({ phone: '+7 701 123 45 67', locale: 'kk', profileVersion: 1 });

    // A second tab with the old version loses.
    expect((await send('PATCH', '/auth/me/profile', { version: 0, aboutMe: 'Другое' }, headers)).status).toBe(409);
    // Forbidden fields are refused, not ignored.
    for (const forbidden of [{ firstName: 'Мария' }, { email: 'x@example.test' }, { position: 'Директор' }, { shift: '2/2' }, { role: 'admin' }]) {
      expect((await send('PATCH', '/auth/me/profile', { version: 1, ...forbidden }, headers)).status).toBe(400);
    }
    expect(await prisma.user.findUniqueOrThrow({ where: { id: worker.id }, select: { firstName: true, email: true, position: true } })).toEqual({ firstName: 'worker', email: worker.email, position: null });

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId, targetId: worker.id, action: 'user.profile_updated' } });
    expect(audit.actorId).toBe(worker.id);
    expect(audit.metadata).toEqual({ fields: ['phone', 'locale', 'aboutMe'] });
  });

  it('shows the photo to its owner, to an administrator and to the manager of the team, and to nobody else', async () => {
    const admin = await createUser('boss', 'admin');
    const manager = await createUser('lead', 'manager');
    const outsiderManager = await createUser('other', 'manager');
    const worker = await createUser('photo', 'learner');
    const stranger = await createUser('stranger', 'learner');
    const group = await prisma.group.create({ data: { organizationId, name: 'Team', slug: `team-${randomUUID()}` } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: worker.id } });
    await prisma.managerGroup.create({ data: { organizationId, groupId: group.id, managerId: manager.id } });
    const workerHeaders = await headersFor(worker.email);

    expect((await send('GET', `/users/${worker.id}/photo`, undefined, workerHeaders)).status).toBe(404);
    expect((await send('POST', '/auth/me/photo', undefined, workerHeaders)).status).toBe(400);

    const uploaded = await fetch(`${baseUrl}/api/v1/auth/me/photo`, { method: 'POST', headers: workerHeaders, body: photoForm() });
    expect(uploaded.status).toBe(201);
    expect(await unwrap(uploaded)).toMatchObject({ hasPhoto: true });

    for (const viewer of [worker, admin, manager]) {
      const response = await send('GET', `/users/${worker.id}/photo`, undefined, await headersFor(viewer.email));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await response.arrayBuffer()).equals(PNG)).toBe(true);
    }
    expect((await send('GET', `/users/me/photo`, undefined, workerHeaders)).status).toBe(200);
    for (const viewer of [outsiderManager, stranger]) {
      expect((await send('GET', `/users/${worker.id}/photo`, undefined, await headersFor(viewer.email))).status).toBe(404);
    }

    const bad = new FormData();
    bad.append('file', new Blob([new Uint8Array(Buffer.from('not an image'))], { type: 'image/png' }), 'me.png');
    expect((await fetch(`${baseUrl}/api/v1/auth/me/photo`, { method: 'POST', headers: workerHeaders, body: bad })).status).toBe(400);

    expect(storage.size).toBe(1);
    const removed = await send('DELETE', '/auth/me/photo', undefined, workerHeaders);
    expect(removed.status).toBe(200);
    expect(await unwrap(removed)).toMatchObject({ hasPhoto: false });
    expect(storage.size).toBe(0);
    expect((await send('GET', `/users/${worker.id}/photo`, undefined, workerHeaders)).status).toBe(404);
  });
});
