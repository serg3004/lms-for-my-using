/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 501: a person without a mailbox is created by an administrator, activates by employee number and full name,
// and signs in by employee number, last name and password — real HTTP stack and Postgres.
const PASSWORD = 'Invite1!Invite';
const OWN_PASSWORD = 'Activate7!Own-Pass';

describe('activation and sign-in without email — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  let otherOrganizationId: string;
  let slug: string;
  let adminHeaders: Record<string, string>;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'database-smoke-jwt-secret-32-characters';
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module.js');
    const { PrismaService: Prisma } = await import('../database/prisma.service.js');
    const { ApiExceptionFilter } = await import('../common/filters/api-exception.filter.js');
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = testingModule.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(Prisma);
    const runId = randomUUID();
    slug = `ident-${runId}`;
    organizationId = (await prisma.organization.create({ data: { name: `Ident ${runId}`, slug } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: `Ident other ${runId}`, slug: `ident-other-${runId}` } })).id;
    const email = `admin-${runId}@example.test`;
    const admin = await prisma.user.create({ data: { organizationId, email, passwordHash: await hashPassword(PASSWORD), firstName: 'Admin', lastName: 'User' } });
    await prisma.membership.create({ data: { organizationId, userId: admin.id, role: 'admin' } });
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, email, password: PASSWORD }) });
    const body = (await response.json()) as { accessToken?: string; data?: { accessToken: string } };
    adminHeaders = { authorization: `Bearer ${body.accessToken ?? body.data?.accessToken}` };
  });

  afterAll(async () => {
    try {
      for (const id of [organizationId, otherOrganizationId]) {
        if (!id) continue;
        await prisma.auditLog.deleteMany({ where: { organizationId: id } });
        await prisma.user.deleteMany({ where: { organizationId: id } });
        await prisma.organization.deleteMany({ where: { id } });
      }
    } finally {
      await app?.close();
    }
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}/api/v1${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const unwrap = async <T>(response: Response) => {
    const body = (await response.json()) as { data?: T } & T;
    return (body.data ?? body) as T;
  };
  const number = () => `T-${randomUUID().slice(0, 8)}`;
  const activate = (input: Record<string, unknown>) => post('/auth/activate', { organizationId, ...input });
  const signIn = (input: Record<string, unknown>) => post('/auth/login', { organizationId, ...input });

  it('creates a person without an email, who activates once by number and full name and then signs in by number and last name', async () => {
    const employeeNumber = number();
    const created = await post('/users', { organizationId, firstName: 'Айгуль', lastName: 'Каримова', middleName: 'Ахметовна', activateByIdentity: true, customFields: { employee_number: employeeNumber } }, adminHeaders);
    expect(created.status).toBe(201);
    const user = await unwrap<{ id: string; email: string; status: string }>(created);
    expect(user.status).toBe('invited');
    expect(user.email.endsWith('@no-email.invalid')).toBe(true);
    expect(await prisma.userInvitation.count({ where: { userId: user.id } })).toBe(0);

    // Not active yet: no sign-in, with any password.
    expect((await signIn({ employeeNumber, lastName: 'Каримова', password: OWN_PASSWORD })).status).toBe(401);

    const full = { employeeNumber: ` ${employeeNumber.toLowerCase()} `, lastName: 'каримова', firstName: 'АЙГУЛЬ', middleName: 'ахметовна' };
    // A weak password is refused only after the identity matched, and does not use up the activation.
    expect((await activate({ ...full, password: 'weak' })).status).toBe(400);
    expect((await activate({ ...full, password: OWN_PASSWORD })).status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe('active');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).identityActivation).toBe(false);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'user.identity_activated', targetId: user.id } })).toBe(1);

    // A second activation of the same card does not pass.
    expect((await activate({ ...full, password: OWN_PASSWORD })).status).toBe(400);

    // Sign-in by number, last name and password: the last name does not replace the password.
    expect((await signIn({ employeeNumber, lastName: 'Каримова', password: OWN_PASSWORD })).status).toBe(201);
    expect((await signIn({ employeeNumber, lastName: 'Каримова', password: 'Wrong7!Wrong-Pass' })).status).toBe(401);
    expect((await signIn({ employeeNumber, lastName: 'Другая', password: OWN_PASSWORD })).status).toBe(401);
    expect((await signIn({ employeeNumber: number(), lastName: 'Каримова', password: OWN_PASSWORD })).status).toBe(401);
  });

  it('answers the same way whatever is wrong, and does not cross organizations', async () => {
    const employeeNumber = number();
    await post('/users', { organizationId, firstName: 'Олег', lastName: 'Петров', activateByIdentity: true, customFields: { employee_number: employeeNumber } }, adminHeaders);
    const answers = [
      await activate({ employeeNumber: number(), lastName: 'Петров', firstName: 'Олег', password: OWN_PASSWORD }),
      await activate({ employeeNumber, lastName: 'Иванов', firstName: 'Олег', password: OWN_PASSWORD }),
      await activate({ employeeNumber, lastName: 'Петров', firstName: 'Игорь', password: OWN_PASSWORD }),
      await activate({ employeeNumber, lastName: 'Петров', firstName: 'Олег', middleName: 'Лишнее', password: OWN_PASSWORD }),
      await post('/auth/activate', { organizationId: otherOrganizationId, employeeNumber, lastName: 'Петров', firstName: 'Олег', password: OWN_PASSWORD }),
      await post('/auth/activate', { organizationId: 'no-such-organization', employeeNumber, lastName: 'Петров', firstName: 'Олег', password: OWN_PASSWORD }),
    ];
    const bodies = await Promise.all(answers.map(async (answer) => ({ status: answer.status, message: JSON.stringify(await answer.json()).replace(/"(timestamp|requestId|path)":"[^"]*"/g, '') })));
    expect(new Set(bodies.map((item) => item.status))).toEqual(new Set([400]));
    expect(new Set(bodies.map((item) => item.message)).size).toBe(1);
  });

  it('refuses activation for people who were not allowed it, and creation without a way in', async () => {
    const employeeNumber = number();
    // Invited by mail (not by number): the screen does not activate them.
    const invited = await post('/users', { organizationId, email: `mail-${randomUUID()}@example.test`, firstName: 'Вера', lastName: 'Сидорова', customFields: { employee_number: employeeNumber } }, adminHeaders);
    expect(invited.status).toBe(201);
    expect((await activate({ employeeNumber, lastName: 'Сидорова', firstName: 'Вера', password: OWN_PASSWORD })).status).toBe(400);

    expect((await post('/users', { organizationId, firstName: 'Без', lastName: 'Пути', customFields: { employee_number: number() } }, adminHeaders)).status).toBe(400);
    expect((await post('/users', { organizationId, firstName: 'Без', lastName: 'Номера', activateByIdentity: true }, adminHeaders)).status).toBe(400);
    expect((await post('/users', { organizationId, firstName: 'Два', lastName: 'Пути', activateByIdentity: true, temporaryPassword: true, customFields: { employee_number: number() } }, adminHeaders)).status).toBe(400);
    // The number is unique in the organization.
    expect((await post('/users', { organizationId, firstName: 'Копия', lastName: 'Номера', activateByIdentity: true, customFields: { employee_number: employeeNumber } }, adminHeaders)).status).toBe(409);
  });

  it('gives a temporary password to a person without an email, who signs in by number and must choose their own', async () => {
    const employeeNumber = number();
    const created = await post('/users', { organizationId, firstName: 'Нурлан', lastName: 'Сейтов', temporaryPassword: true, customFields: { employee_number: employeeNumber } }, adminHeaders);
    expect(created.status).toBe(201);
    const user = await unwrap<{ id: string; status: string; temporaryPassword: { temporaryPassword: string } }>(created);
    expect(user.status).toBe('active');
    const temporary = user.temporaryPassword.temporaryPassword;

    const first = await signIn({ employeeNumber, lastName: 'Сейтов', password: temporary });
    expect(first.status).toBe(201);
    const body = await unwrap<{ user: { mustChangePassword: boolean } }>(first);
    expect(body.user.mustChangePassword).toBe(true);
    // A temporary password works once.
    expect((await signIn({ employeeNumber, lastName: 'Сейтов', password: temporary })).status).toBe(401);
  });

  it('locks the account after a series of wrong passwords, like sign-in by email', async () => {
    const employeeNumber = number();
    const created = await post('/users', { organizationId, firstName: 'Марат', lastName: 'Блок', temporaryPassword: true, customFields: { employee_number: employeeNumber } }, adminHeaders);
    const user = await unwrap<{ id: string }>(created);
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false, temporaryPasswordExpiresAt: null } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await signIn({ employeeNumber, lastName: 'Блок', password: 'Wrong7!Wrong-Pass' })).status).toBe(401);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).loginLockedUntil).not.toBeNull();
  });

  it('imports a row without an email only with activation by employee number and the number', async () => {
    const employeeNumber = number();
    const response = await post('/users/import', {
      organizationId, mode: 'create',
      users: [
        { firstName: 'Асем', lastName: 'Файл', activateByIdentity: true, customFields: { employee_number: employeeNumber } },
        { firstName: 'Без', lastName: 'Способа', customFields: { employee_number: number() } },
        { firstName: 'Без', lastName: 'Номера', activateByIdentity: true },
      ],
    }, adminHeaders);
    expect(response.status).toBe(201);
    const report = await unwrap<{ createdCount: number; rows: Array<{ status: string; errors: string[]; email: string | null }> }>(response);
    expect(report.rows.map((row) => row.status)).toEqual(['created', 'skipped', 'skipped']);
    expect(report.rows[0]!.email).toBeNull();
    expect((await activate({ employeeNumber, lastName: 'Файл', firstName: 'Асем', password: OWN_PASSWORD })).status).toBe(201);
  });
});
