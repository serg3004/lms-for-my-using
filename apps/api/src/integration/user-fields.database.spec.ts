/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 499: custom user fields: types, uniqueness, rights per viewer, search, archive, audit and the work schedule synonym of `shift`.
const PASSWORD = 'Fields1!Fields1Pass';
const labels = { ru: 'Поле', en: 'Field', kk: 'Өріс', zh: '字段' };

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('custom user fields — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  let otherOrganizationId: string;
  let adminHeaders: Record<string, string>;
  let managerHeaders: Record<string, string>;
  let learner: { id: string; email: string };
  let learnerHeaders: Record<string, string>;
  let adminId: string;

  async function createUser(label: string, role: 'learner' | 'admin' | 'manager') {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { organizationId, email, status: 'active', passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'Person' } });
    await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
    return { id: user.id, email };
  }
  const send = async (method: string, path: string, headers: Record<string, string>, body?: unknown) => {
    const response = await fetch(`${baseUrl}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await response.json().catch(() => ({}))) as Json;
    return { status: response.status, body: (json.data ?? json) as Json };
  };
  async function headersFor(email: string) {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, email, password: PASSWORD }) });
    const body = (await response.json()) as Json;
    return { authorization: `Bearer ${body.accessToken ?? body.data?.accessToken}` };
  }
  const userBody = (user: { email: string }, extra: Json = {}) => ({ email: user.email, firstName: 'Ada', lastName: 'Person', ...extra });

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'database-smoke-jwt-secret-32-characters';
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module.js');
    const { PrismaService: Prisma } = await import('../database/prisma.service.js');
    const { ApiExceptionFilter } = await import('../common/filters/api-exception.filter.js');
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = testingModule.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(Prisma);
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Fields ${runId}`, slug: `fields-${runId}` } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: `Fields other ${runId}`, slug: `fields-other-${runId}` } })).id;

    const admin = await createUser('admin', 'admin');
    adminId = admin.id;
    const manager = await createUser('manager', 'manager');
    learner = await createUser('learner', 'learner');
    const group = await prisma.group.create({ data: { organizationId, name: 'Team', slug: `team-${randomUUID()}` } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: learner.id } });
    await prisma.managerGroup.create({ data: { organizationId, groupId: group.id, managerId: manager.id } });
    adminHeaders = await headersFor(admin.email);
    managerHeaders = await headersFor(manager.email);
    learnerHeaders = await headersFor(learner.email);
  });

  afterAll(async () => {
    try {
      for (const id of [organizationId, otherOrganizationId].filter(Boolean)) {
        await prisma.auditLog.deleteMany({ where: { organizationId: id } });
        await prisma.managerGroup.deleteMany({ where: { organizationId: id } });
        await prisma.groupMember.deleteMany({ where: { organizationId: id } });
        await prisma.group.deleteMany({ where: { organizationId: id } });
        await prisma.userFieldValue.deleteMany({ where: { organizationId: id } });
        await prisma.userFieldDefinition.deleteMany({ where: { organizationId: id } });
        await prisma.user.deleteMany({ where: { organizationId: id } });
        await prisma.organization.deleteMany({ where: { id } });
      }
    } finally {
      await app?.close();
    }
  });

  it('puts the ready-made set in place by itself and leaves the whole set to the administrator', async () => {
    expect((await send('GET', '/user-fields', managerHeaders)).status).toBe(403);
    expect((await send('GET', '/user-fields', learnerHeaders)).status).toBe(403);
    // No button was pressed: the first use finds the set already there.
    const list = await send('GET', '/user-fields', adminHeaders);
    expect(list.body.items.map((item: Json) => item.key)).toEqual(['employee_number', 'whatsapp', 'telegram', 'hire_date', 'work_schedule']);
    expect(list.body.items[0]).toMatchObject({ unique: true, searchable: true, visibleTo: ['manager'], editableBy: [] });
    expect((await send('POST', '/user-fields/template', adminHeaders)).body.created).toEqual([]);
    // The person sees only what is visible to them, with no rights lists.
    const own = await send('GET', '/user-fields/visible', learnerHeaders);
    expect(own.body.items.map((item: Json) => item.key)).toEqual(['whatsapp', 'telegram', 'hire_date', 'work_schedule']);
    expect(own.body.items[0]).not.toHaveProperty('visibleTo');
    expect((await send('POST', '/user-fields', adminHeaders, { key: 'employee_number', type: 'text', labels })).status).toBe(409);

    // Every field of the set can be changed, archived and deleted like any other.
    const renamed = await send('PATCH', '/user-fields/telegram', adminHeaders, { labels: { ru: 'Телеграм', en: 'Telegram', kk: 'Telegram', zh: 'Telegram' }, required: false, editableBy: [] });
    expect(renamed.body).toMatchObject({ labels: { ru: 'Телеграм' }, editableBy: [] });
    expect((await send('DELETE', '/user-fields/telegram', adminHeaders)).status).toBe(409);
    await send('POST', '/user-fields/telegram/archive', adminHeaders);
    expect((await send('DELETE', '/user-fields/telegram', managerHeaders)).status).toBe(403);
    expect((await send('DELETE', '/user-fields/telegram', adminHeaders)).body).toMatchObject({ deleted: true });
    expect((await send('GET', '/user-fields', adminHeaders)).body.items.map((item: Json) => item.key)).not.toContain('telegram');
    // A field the administrator removed does not come back by itself; pressing the template button brings back only what is missing.
    expect((await send('GET', '/user-fields/visible', learnerHeaders)).body.items.map((item: Json) => item.key)).not.toContain('telegram');
    expect((await send('POST', '/user-fields/template', adminHeaders)).body.created).toEqual(['telegram']);
    expect((await send('GET', '/user-fields', adminHeaders)).body.items.find((item: Json) => item.key === 'telegram').labels.ru).toBe('Telegram');
  });

  it('writes values on creation and update, keeps the employee number unique and mirrors the work schedule into shift', async () => {
    const created = await send('POST', '/users', adminHeaders, { organizationId, ...userBody(learner), email: `new-${randomUUID()}@example.test`, password: PASSWORD, customFields: { employee_number: 'ZQ-100', hire_date: '2026-03-01', work_schedule: '5-2', whatsapp: '+7 701 123 45 67' } });
    expect(created.status).toBe(201);
    expect(created.body.customFields).toEqual({ employee_number: 'ZQ-100', hire_date: '2026-03-01', work_schedule: '5-2', whatsapp: '+7 701 123 45 67' });
    expect(created.body.shift).toBe('5/2');

    const duplicate = await send('POST', '/users', adminHeaders, { organizationId, ...userBody(learner), email: `dup-${randomUUID()}@example.test`, password: PASSWORD, customFields: { employee_number: ' zq-100 ' } });
    expect(duplicate.status).toBe(409);
    expect(await prisma.user.count({ where: { organizationId, email: { startsWith: 'dup-' } } })).toBe(0);

    expect((await send('POST', '/users', adminHeaders, { organizationId, ...userBody(learner), email: `bad-${randomUUID()}@example.test`, password: PASSWORD, customFields: { hire_date: '2026-02-30' } })).status).toBe(400);
    expect((await send('POST', '/users', adminHeaders, { organizationId, ...userBody(learner), email: `bad2-${randomUUID()}@example.test`, password: PASSWORD, customFields: { work_schedule: 'nope' } })).status).toBe(400);

    // The old text field and the new one stay in step in both directions.
    const viaShift = await send('PATCH', `/users/${learner.id}`, adminHeaders, userBody(learner, { shift: 'Сменный' }));
    expect(viaShift.status).toBe(200);
    expect(viaShift.body.customFields.work_schedule).toBe('shift');
    const viaField = await send('PATCH', `/users/${learner.id}`, adminHeaders, userBody(learner, { customFields: { work_schedule: '2-2' } }));
    expect(viaField.body.shift).toBe('2/2');
  });

  it('refuses a duplicate employee number on update, but lets the same person keep their own', async () => {
    const first = await send('PATCH', `/users/${learner.id}`, adminHeaders, userBody(learner, { customFields: { employee_number: 'ZQ-1' } }));
    expect(first.status).toBe(200);
    expect((await send('PATCH', `/users/${learner.id}`, adminHeaders, userBody(learner, { customFields: { employee_number: 'zq-1' } }))).status).toBe(200);
    const other = await createUser('other', 'learner');
    expect((await send('PATCH', `/users/${other.id}`, adminHeaders, userBody(other, { customFields: { employee_number: 'ZQ-1' } }))).status).toBe(409);
    expect((await send('PATCH', `/users/${other.id}`, adminHeaders, userBody(other, { customFields: { employee_number: 'ZQ-2' } }))).status).toBe(200);
    // Another organization may use the same number: uniqueness is per field of one organization.
    const definition = await prisma.userFieldDefinition.create({ data: { organizationId: otherOrganizationId, key: 'employee_number', labels, type: 'text', isUnique: true, visibleTo: ['manager'], editableBy: [] } });
    const foreign = await prisma.user.create({ data: { organizationId: otherOrganizationId, email: `f-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'F', lastName: 'F' } });
    await expect(prisma.userFieldValue.create({ data: { organizationId: otherOrganizationId, userId: foreign.id, fieldId: definition.id, value: 'ZQ-1', normalizedValue: 'zq-1', uniqueKey: 'zq-1' } })).resolves.toBeDefined();
    const mine = await send('GET', `/users/${learner.id}`, adminHeaders);
    expect(mine.body.customFields.employee_number).toBe('zq-1');
  });

  it('audits the old and new employee number', async () => {
    await send('PATCH', `/users/${learner.id}`, adminHeaders, userBody(learner, { customFields: { employee_number: 'ZQ-9', hire_date: '2026-04-01' } }));
    const entry = await prisma.auditLog.findFirst({ where: { organizationId, targetId: learner.id, action: 'user.updated' }, orderBy: { createdAt: 'desc' } });
    expect(entry?.metadata).toMatchObject({ customFields: ['employee_number', 'hire_date'], customFieldChanges: [{ key: 'employee_number', from: 'zq-1', to: 'ZQ-9' }] });
    expect(JSON.stringify(entry?.metadata)).not.toContain('2026-04-01');
  });

  it('searches by the employee number and filters by a field, within what the viewer may see', async () => {
    const found = await send('GET', '/users?search=zq-9', adminHeaders);
    expect(found.body.items.map((item: Json) => item.id)).toEqual([learner.id]);
    const byManager = await send('GET', '/users?search=ZQ-9', managerHeaders);
    expect(byManager.body.items.map((item: Json) => item.id)).toEqual([learner.id]);
    expect((await send('GET', '/users?search=zzz-none', adminHeaders)).body.items).toEqual([]);

    const filtered = await send('GET', '/users?fieldKey=work_schedule&fieldValue=2-2', adminHeaders);
    expect(filtered.body.items.map((item: Json) => item.id)).toEqual([learner.id]);
    expect((await send('GET', '/users?fieldKey=work_schedule&fieldValue=5-2', adminHeaders)).body.items.map((item: Json) => item.id)).not.toContain(learner.id);
    expect((await send('GET', '/users?fieldKey=nope&fieldValue=1', adminHeaders)).status).toBe(400);
    expect((await send('GET', '/users?fieldKey=work_schedule', adminHeaders)).status).toBe(400);
  });

  it('never returns a hidden field and answers 403 for a visible one the viewer may not edit', async () => {
    await send('POST', '/user-fields', adminHeaders, { key: 'secret_note', type: 'text', labels, visibleTo: [], editableBy: [], searchable: true });
    await send('PATCH', `/users/${learner.id}`, adminHeaders, userBody(learner, { customFields: { secret_note: 'internal-only-42' } }));
    expect((await send('GET', `/users/${learner.id}`, adminHeaders)).body.customFields.secret_note).toBe('internal-only-42');

    const asManager = await send('GET', `/users/${learner.id}`, managerHeaders);
    expect(asManager.body.customFields).toHaveProperty('employee_number');
    expect(JSON.stringify(asManager.body)).not.toContain('internal-only-42');
    const list = await send('GET', '/users', managerHeaders);
    expect(JSON.stringify(list.body)).not.toContain('internal-only-42');
    // Not searchable for those who cannot see it either.
    expect((await send('GET', '/users?search=internal-only-42', managerHeaders)).body.items).toEqual([]);
    expect((await send('GET', '/users?search=internal-only-42', adminHeaders)).body.items).toHaveLength(1);

    expect((await send('PATCH', `/users/${learner.id}`, managerHeaders, userBody(learner, { customFields: { secret_note: 'x' } }))).status).toBe(400);
    expect((await send('PATCH', `/users/${learner.id}`, managerHeaders, userBody(learner, { customFields: { hire_date: '2026-05-01' } }))).status).toBe(403);
    expect((await send('PATCH', `/users/${learner.id}`, managerHeaders, userBody(learner, { customFields: { work_schedule: '5-2' } }))).status).toBe(200);
    expect((await send('GET', '/user-fields/for-users', managerHeaders)).body.items.map((item: Json) => item.key)).not.toContain('secret_note');
  });

  it('lets people edit only their own editable fields and shows them no others', async () => {
    const profile = await send('GET', '/auth/me/profile', learnerHeaders);
    expect(profile.body.customFields).not.toHaveProperty('employee_number');
    expect(profile.body.customFields).not.toHaveProperty('secret_note');
    expect(profile.body.customFields).toHaveProperty('hire_date');

    const version = profile.body.version as number;
    const saved = await send('PATCH', '/auth/me/profile', learnerHeaders, { version, customFields: { whatsapp: '+7 702 555 00 11' } });
    expect(saved.status).toBe(200);
    expect(saved.body.customFields.whatsapp).toBe('+7 702 555 00 11');
    expect(saved.body.version).toBe(version + 1);
    expect((await send('PATCH', '/auth/me/profile', learnerHeaders, { version: version + 1, customFields: { hire_date: '2020-01-01' } })).status).toBe(403);
    expect((await send('PATCH', '/auth/me/profile', learnerHeaders, { version: version + 1, customFields: { employee_number: 'Z-1' } })).status).toBe(400);
    expect((await send('PATCH', '/auth/me/profile', learnerHeaders, { version: version + 1, customFields: { whatsapp: 'not a phone' } })).status).toBe(400);
  });

  it('archives a field without losing the values, restores it, and cannot drop a list option', async () => {
    expect((await send('POST', '/user-fields/hire_date/archive', adminHeaders)).body.archived).toBe(true);
    expect((await send('GET', `/users/${learner.id}`, adminHeaders)).body.customFields).not.toHaveProperty('hire_date');
    expect((await send('PATCH', `/users/${learner.id}`, adminHeaders, userBody(learner, { customFields: { hire_date: '2026-06-01' } }))).status).toBe(400);
    expect((await send('POST', '/user-fields/hire_date/restore', adminHeaders)).body.archived).toBe(false);
    expect((await send('GET', `/users/${learner.id}`, adminHeaders)).body.customFields.hire_date).toBe('2026-04-01');

    const current = (await send('GET', '/user-fields', adminHeaders)).body.items.find((item: Json) => item.key === 'work_schedule');
    expect((await send('PATCH', '/user-fields/work_schedule', adminHeaders, { options: current.options.slice(1) })).status).toBe(400);
    const archivedOption = current.options.map((option: Json) => (option.key === '5-2' ? { ...option, archived: true } : option));
    expect((await send('PATCH', '/user-fields/work_schedule', adminHeaders, { options: archivedOption })).status).toBe(200);
    // The person who already holds the archived option keeps it; nobody else can take it.
    expect((await send('PATCH', `/users/${learner.id}`, adminHeaders, userBody(learner, { customFields: { work_schedule: '5-2' } }))).status).toBe(200);
    const newcomer = await createUser('newcomer', 'learner');
    expect((await send('PATCH', `/users/${newcomer.id}`, adminHeaders, userBody(newcomer, { customFields: { work_schedule: '5-2' } }))).status).toBe(400);
    expect((await send('PUT', '/user-fields/order', adminHeaders, { keys: ['work_schedule', 'employee_number'] })).status).toBe(400);
  });

  it('enforces required fields on import and refuses duplicates inside the file', async () => {
    await send('POST', '/user-fields', adminHeaders, { key: 'badge', type: 'number', labels, required: true, unique: true, visibleTo: ['manager'], editableBy: [] });
    const mk = (n: number, customFields?: Json) => ({ email: `imp${n}-${randomUUID()}@example.test`, firstName: 'I', lastName: `M${n}`, password: PASSWORD, ...(customFields ? { customFields } : {}) });
    const rows = [mk(1, { badge: 7 }), mk(2, { badge: '7' }), mk(3), mk(4, { badge: 'abc' }), mk(5, { badge: 8, employee_number: 'ZQ-9' }), mk(6, { badge: 9, employee_number: 'IMP-6' })];
    const preview = await send('POST', '/users/import', adminHeaders, { organizationId, mode: 'validateOnly', users: rows });
    expect(preview.status).toBe(201);
    expect(preview.body.rows.map((row: Json) => row.status)).toEqual(['valid', 'skipped', 'skipped', 'skipped', 'skipped', 'valid']);
    const done = await send('POST', '/users/import', adminHeaders, { organizationId, mode: 'create', users: rows });
    expect(done.body.createdCount).toBe(2);
    const created = await prisma.userFieldValue.findMany({ where: { organizationId, field: { key: 'badge' } }, select: { value: true } });
    expect(created.map((row) => row.value).sort()).toEqual(['7', '9']);
    // Required fields block the plain bulk route, which has no place for values.
    expect((await send('POST', '/users/bulk', adminHeaders, { organizationId, users: [{ email: `b-${randomUUID()}@example.test`, firstName: 'B', lastName: 'B', password: PASSWORD }] })).status).toBe(409);
    expect(adminId).toBeDefined();
  });
});
