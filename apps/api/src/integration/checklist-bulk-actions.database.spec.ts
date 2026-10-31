/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 394 against real Postgres: a bulk action never touches another organization's sheets, deletes are soft,
// a sheet with an active assignment is turned into a draft instead of being deleted, and edit rights apply per sheet.
describe('checklist bulk actions (PR 394) — database', () => {
  let prisma: PrismaService;
  let service: ChecklistsService;
  let organizationId: string;
  let foreignOrganizationId: string;
  let authorId: string;
  let otherId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
    service = new ChecklistsService(prisma, {} as UploadService);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  const orgs: string[] = [];
  async function makeOrg(label: string) {
    const runId = randomUUID();
    const org = await prisma.organization.create({ data: { name: `${label} ${runId}`, slug: `${label}-${runId}` } });
    orgs.push(org.id);
    return org.id;
  }
  async function makeUser(org: string) {
    return (await prisma.user.create({ data: { organizationId: org, email: `${randomUUID()}@example.test`, passwordHash: 'not-used', firstName: 'Bulk', lastName: 'User' } })).id;
  }
  async function makeChecklist(org: string, createdBy: string, data: { status?: 'draft' | 'published' | 'archived'; allowEditByAll?: boolean } = {}) {
    const checklist = await prisma.checklist.create({ data: { organizationId: org, createdBy, title: `Sheet ${randomUUID()}`, status: data.status ?? 'published', allowEditByAll: data.allowEditByAll ?? true } });
    await prisma.checklistItem.create({ data: { organizationId: org, checklistId: checklist.id, order: 0, text: 'Criterion', points: 10, isRequired: true } });
    return checklist;
  }

  beforeEach(async () => {
    organizationId = await makeOrg('bulk');
    foreignOrganizationId = await makeOrg('bulk-foreign');
    authorId = await makeUser(organizationId);
    otherId = await makeUser(organizationId);
  });
  afterEach(async () => {
    const ids = orgs.splice(0);
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.checklistItem.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.checklist.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  });

  it('never touches a sheet of another organization', async () => {
    const own = await makeChecklist(organizationId, authorId);
    const foreignAuthor = await makeUser(foreignOrganizationId);
    const foreign = await makeChecklist(foreignOrganizationId, foreignAuthor);

    const result = await service.bulkAction('delete', [own.id, foreign.id], organizationId, { id: authorId, roles: ['admin'] });

    expect(result.results).toEqual([{ id: own.id, result: 'done' }, { id: foreign.id, result: 'skipped', reason: 'not_found' }]);
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: foreign.id } })).deletedAt).toBeNull();
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: own.id } })).deletedAt).not.toBeNull();
  });

  it('turns a sheet with an active assignment into a draft instead of deleting it', async () => {
    const busy = await makeChecklist(organizationId, authorId);
    await prisma.checklistInstance.create({ data: { organizationId, checklistId: busy.id, userId: otherId, status: 'assigned' } });

    const result = await service.bulkAction('delete', [busy.id], organizationId, { id: authorId, roles: ['instructor'] });

    expect(result.results).toEqual([{ id: busy.id, result: 'skipped', reason: 'moved_to_draft' }]);
    const stored = await prisma.checklist.findUniqueOrThrow({ where: { id: busy.id } });
    expect(stored.deletedAt).toBeNull();
    expect(stored.status).toBe('draft');
  });

  it('applies edit rights per sheet: a stranger cannot change a restricted sheet, an admin can', async () => {
    const restricted = await makeChecklist(organizationId, authorId, { allowEditByAll: false });

    const denied = await service.bulkAction('archive', [restricted.id], organizationId, { id: otherId, roles: ['instructor'] });
    expect(denied.results).toEqual([{ id: restricted.id, result: 'skipped', reason: 'forbidden' }]);
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: restricted.id } })).status).toBe('published');

    const allowed = await service.bulkAction('archive', [restricted.id], organizationId, { id: otherId, roles: ['admin'] });
    expect(allowed.done).toBe(1);
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: restricted.id } })).status).toBe('archived');
  });

  it('refuses to publish a sheet without criteria and says why, without failing the others', async () => {
    const empty = await prisma.checklist.create({ data: { organizationId, createdBy: authorId, title: 'Empty', status: 'draft' } });
    const ready = await makeChecklist(organizationId, authorId, { status: 'draft' });

    const result = await service.bulkAction('publish', [empty.id, ready.id], organizationId, { id: authorId, roles: ['instructor'] });

    expect(result.results[0]).toMatchObject({ id: empty.id, result: 'skipped', reason: 'cannot_publish' });
    expect(result.results[1]).toEqual({ id: ready.id, result: 'done' });
  });
});
