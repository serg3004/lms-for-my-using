/// <reference types="jest" />

import { randomUUID } from 'node:crypto';
import type { UserRole } from '@prisma/client';
import { createChecklistSchema } from '../modules/checklists/checklists.schemas.js';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { AuditLogService } from '../modules/audit-log/public.js';
import { ChecklistFoldersService } from '../modules/checklists/checklist-folders.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

type Actor = { id: string; roles: string[] };

// PR 395 against real Postgres: depth, cycles, duplicate names, organization isolation, access by role and flag,
// and the cascade delete that turns sheets with active assignments into root drafts.
describe('checklist folders (PR 395) — database', () => {
  let prisma: PrismaService;
  let folders: ChecklistFoldersService;
  let checklists: ChecklistsService;
  let organizationId: string;
  let foreignOrganizationId: string;
  let admin: Actor;
  let author: Actor;
  let colleague: Actor;
  let learner: Actor;
  const orgs: string[] = [];

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
    folders = new ChecklistFoldersService(prisma, new AuditLogService(prisma));
    checklists = new ChecklistsService(prisma, {} as UploadService);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  async function makeOrg(label: string) {
    const runId = randomUUID();
    const org = await prisma.organization.create({ data: { name: `${label} ${runId}`, slug: `${label}-${runId}` } });
    orgs.push(org.id);
    return org.id;
  }
  async function makeActor(org: string, roles: string[]): Promise<Actor> {
    const user = await prisma.user.create({ data: { organizationId: org, email: `${randomUUID()}@example.test`, passwordHash: 'not-used', firstName: 'Folder', lastName: 'User' } });
    await prisma.membership.createMany({ data: roles.map((role) => ({ organizationId: org, userId: user.id, role: role as UserRole })) });
    return { id: user.id, roles };
  }
  async function makeSheet(folderId: string | null, createdBy: string, title = `Sheet ${randomUUID()}`) {
    const sheet = await prisma.checklist.create({ data: { organizationId, createdBy, title, status: 'published', folderId } });
    await prisma.checklistItem.create({ data: { organizationId, checklistId: sheet.id, order: 0, text: 'Criterion', points: 10, isRequired: true } });
    return sheet;
  }
  /** Builds a chain of `depth` folders under the actor and returns their ids from the root down. */
  async function chain(actor: Actor, depth: number, label = 'Level') {
    const ids: string[] = [];
    for (let level = 1; level <= depth; level += 1) {
      ids.push((await folders.create(organizationId, actor, { name: `${label} ${level}`, parentId: ids.at(-1) ?? null })).id);
    }
    return ids;
  }

  beforeEach(async () => {
    organizationId = await makeOrg('folders');
    foreignOrganizationId = await makeOrg('folders-foreign');
    admin = await makeActor(organizationId, ['admin']);
    author = await makeActor(organizationId, ['instructor']);
    colleague = await makeActor(organizationId, ['manager']);
    learner = await makeActor(organizationId, ['learner']);
  });
  afterEach(async () => {
    const ids = orgs.splice(0);
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.checklistItem.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.checklistTemplate.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.checklist.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.checklistFolder.updateMany({ where: { organizationId: { in: ids } }, data: { parentId: null } });
    await prisma.checklistFolder.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.membership.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  });

  it('allows five levels and rejects a sixth', async () => {
    const ids = await chain(author, 5);
    await expect(folders.create(organizationId, author, { name: 'Too deep', parentId: ids[4] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a move that would make the subtree deeper than five levels, and allows one that fits', async () => {
    const ids = await chain(author, 3); // L1 > L2 > L3
    const other = await chain(author, 3, 'Other'); // second tree: its root has height 3
    // Moving the second tree under L3 gives 3 + 3 = 6 levels.
    await expect(folders.update(other[0]!, organizationId, author, { parentId: ids[2] })).rejects.toBeInstanceOf(BadRequestException);
    // Under L2 it is 2 + 3 = 5 levels.
    await expect(folders.update(other[0]!, organizationId, author, { parentId: ids[1] })).resolves.toMatchObject({ id: other[0] });
  });

  it('refuses to move a folder into itself or into its own descendant', async () => {
    const ids = await chain(author, 3);
    await expect(folders.update(ids[0]!, organizationId, author, { parentId: ids[0] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(folders.update(ids[0]!, organizationId, author, { parentId: ids[2] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate name among siblings regardless of case, but allows it in another parent', async () => {
    const [root] = await chain(author, 1);
    await folders.create(organizationId, author, { name: 'Магазин', parentId: root });
    await expect(folders.create(organizationId, author, { name: ' магазин ', parentId: root })).rejects.toBeInstanceOf(ConflictException);
    await expect(folders.create(organizationId, author, { name: 'Магазин', parentId: null })).resolves.toBeDefined();
  });

  it('renames a folder and keeps the name check against its siblings', async () => {
    const first = await folders.create(organizationId, author, { name: 'First' });
    await folders.create(organizationId, author, { name: 'Second' });
    await expect(folders.update(first.id, organizationId, author, { name: 'second' })).rejects.toBeInstanceOf(ConflictException);
    await expect(folders.update(first.id, organizationId, author, { name: 'Renamed' })).resolves.toMatchObject({ name: 'Renamed' });
  });

  it('never exposes a folder of another organization', async () => {
    const foreignAuthor = await makeActor(foreignOrganizationId, ['admin']);
    const foreign = await folders.create(foreignOrganizationId, foreignAuthor, { name: 'Foreign' });
    await expect(folders.update(foreign.id, organizationId, admin, { name: 'Mine now' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(folders.remove(foreign.id, organizationId, admin)).rejects.toBeInstanceOf(NotFoundException);
    await expect(folders.create(organizationId, admin, { name: 'Child', parentId: foreign.id })).rejects.toBeInstanceOf(NotFoundException);
    expect((await folders.list(organizationId, admin)).folders).toHaveLength(0);
    await expect(checklists.assertCanPlaceInFolder(foreign.id, organizationId, admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows a closed folder only to the administrator and the creator, and an open one to staff but never to a learner', async () => {
    const closed = await folders.create(organizationId, author, { name: 'Closed' });
    const open = await folders.create(organizationId, author, { name: 'Open', visibleToStaff: true });
    const names = async (actor: Actor) => (await folders.list(organizationId, actor)).folders.map((folder) => folder.name).sort();
    expect(await names(author)).toEqual(['Closed', 'Open']);
    expect(await names(admin)).toEqual(['Closed', 'Open']);
    expect(await names(colleague)).toEqual(['Open']);
    expect(await names(learner)).toEqual([]);
    await expect(folders.update(closed.id, organizationId, colleague, { name: 'Hacked' })).rejects.toBeInstanceOf(NotFoundException);
    // Visible but not theirs: view only.
    await expect(folders.update(open.id, organizationId, colleague, { name: 'Hacked' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(folders.remove(open.id, organizationId, colleague)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(folders.update(open.id, organizationId, colleague, { visibleToStaff: false })).rejects.toBeInstanceOf(ForbiddenException);
    // The creator opens the closed folder to staff; now the colleague sees it.
    await folders.update(closed.id, organizationId, author, { visibleToStaff: true });
    expect(await names(colleague)).toEqual(['Closed', 'Open']);
  });

  it('requires the whole chain of parents to be visible', async () => {
    const parent = await folders.create(organizationId, author, { name: 'Parent' });
    await folders.create(organizationId, author, { name: 'Open child', parentId: parent.id, visibleToStaff: true });
    expect((await folders.list(organizationId, colleague)).folders).toHaveLength(0);
    await folders.update(parent.id, organizationId, author, { visibleToStaff: true });
    expect((await folders.list(organizationId, colleague)).folders).toHaveLength(2);
  });

  it('hides sheets of a folder from those who cannot see it, and counts sheets per folder', async () => {
    const closed = await folders.create(organizationId, author, { name: 'Closed' });
    const open = await folders.create(organizationId, author, { name: 'Open', visibleToStaff: true });
    const secret = await makeSheet(closed.id, author.id, 'Secret');
    const shared = await makeSheet(open.id, author.id, 'Shared');
    const rootSheet = await makeSheet(null, author.id, 'Root');

    const titles = async (actor: Actor) => (await checklists.listChecklists(organizationId, undefined, actor)).map((sheet) => sheet.title).sort();
    expect(await titles(admin)).toEqual(['Root', 'Secret', 'Shared']);
    expect(await titles(author)).toEqual(['Root', 'Secret', 'Shared']);
    expect(await titles(colleague)).toEqual(['Root', 'Shared']);
    expect((await folders.list(organizationId, colleague)).checklistCount).toBe(2);
    const adminTree = await folders.list(organizationId, admin);
    expect(adminTree.checklistCount).toBe(3);
    expect(adminTree.folders.find((folder) => folder.id === open.id)).toMatchObject({ checklistCount: 1, totalChecklistCount: 1 });
    expect([secret.id, shared.id, rootSheet.id]).toHaveLength(3);
  });

  it('moves a sheet into a folder and back to the root, and a copy stays in the folder', async () => {
    const folder = await folders.create(organizationId, author, { name: 'Shop' });
    const sheet = await makeSheet(null, author.id);
    await checklists.updateChecklist(sheet.id, organizationId, { folderId: folder.id }, author.id);
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: sheet.id } })).folderId).toBe(folder.id);
    const copy = await checklists.copyChecklist(sheet.id, organizationId, author.id);
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: copy.id } })).folderId).toBe(folder.id);
    await checklists.updateChecklist(sheet.id, organizationId, { folderId: null }, author.id);
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: sheet.id } })).folderId).toBeNull();
  });

  it('moves many sheets in bulk and skips those already in the target folder', async () => {
    const folder = await folders.create(organizationId, author, { name: 'Bulk' });
    const first = await makeSheet(null, author.id);
    const second = await makeSheet(folder.id, author.id);
    const result = await checklists.bulkAction('move', [first.id, second.id], organizationId, { id: author.id, roles: ['instructor'] }, folder.id);
    expect(result.results).toEqual([{ id: first.id, result: 'done' }, { id: second.id, result: 'skipped', reason: 'already_in_folder' }]);
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: first.id } })).folderId).toBe(folder.id);
  });

  it('deletes a folder with every subfolder and sheet inside, and turns a sheet with an active assignment into a root draft', async () => {
    const [top, middle, deepest] = await chain(author, 3);
    const keptOut = await folders.create(organizationId, author, { name: 'Elsewhere' });
    const plain = await makeSheet(middle!, author.id, 'Plain');
    const deep = await makeSheet(deepest!, author.id, 'Deep');
    const busy = await makeSheet(deepest!, author.id, 'Busy');
    const outside = await makeSheet(keptOut.id, author.id, 'Outside');
    await prisma.checklistInstance.create({ data: { organizationId, checklistId: busy.id, userId: colleague.id, status: 'in_progress' } });
    // A finished assignment never blocks the deletion.
    await prisma.checklistInstance.create({ data: { organizationId, checklistId: deep.id, userId: colleague.id, status: 'completed' } });

    const preview = await folders.deleteImpact(top!, organizationId, author);
    expect(preview).toEqual({ folders: 3, checklists: 2, movedToDraft: [{ id: busy.id, title: 'Busy' }] });
    expect(await prisma.checklistFolder.count({ where: { organizationId, deletedAt: null } })).toBe(4);

    const result = await folders.remove(top!, organizationId, author);
    expect(result).toEqual(preview);

    expect((await prisma.checklistFolder.findMany({ where: { organizationId, deletedAt: null } })).map((folder) => folder.id)).toEqual([keptOut.id]);
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: plain.id } })).deletedAt).not.toBeNull();
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: deep.id } })).deletedAt).not.toBeNull();
    const survivor = await prisma.checklist.findUniqueOrThrow({ where: { id: busy.id } });
    expect(survivor).toMatchObject({ deletedAt: null, status: 'draft', folderId: null });
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: outside.id } })).deletedAt).toBeNull();
    // The finished result is kept.
    expect(await prisma.checklistInstance.count({ where: { checklistId: deep.id, status: 'completed' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist.folder_deleted' } })).toBe(1);
  });

  it('PR 407: returns author and visible direct counts, without leaking private subfolders or their sheets', async () => {
    const parent = await folders.create(organizationId, admin, { name: 'Public', visibleToStaff: true });
    const open = await folders.create(organizationId, admin, { name: 'Open', parentId: parent.id, visibleToStaff: true });
    const hidden = await folders.create(organizationId, admin, { name: 'Hidden', parentId: parent.id });
    const removed = await folders.create(organizationId, admin, { name: 'Removed', parentId: parent.id, visibleToStaff: true });
    await prisma.checklistFolder.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
    await makeSheet(parent.id, admin.id); await makeSheet(open.id, admin.id); await makeSheet(hidden.id, admin.id); await makeSheet(removed.id, admin.id);
    const staff = await folders.list(organizationId, colleague);
    expect(staff.folders.find(({ id }) => id === parent.id)).toMatchObject({ creator: { id: admin.id, firstName: 'Folder', lastName: 'User' }, checklistCount: 1, childFolderCount: 1, totalChecklistCount: 2 });
    expect(staff.checklistCount).toBe(2);
    expect((await folders.list(organizationId, admin)).folders.find(({ id }) => id === parent.id)?.childFolderCount).toBe(2);
    await prisma.user.update({ where: { id: admin.id }, data: { firstName: '', lastName: '' } });
    expect((await folders.list(organizationId, colleague)).folders.find(({ id }) => id === parent.id)?.creator).toBeNull();
    await prisma.user.update({ where: { id: admin.id }, data: { firstName: 'Deleted', deletedAt: new Date() } });
    expect((await folders.list(organizationId, colleague)).folders.find(({ id }) => id === parent.id)?.creator).toBeNull();
  });

  it('PR 407: creates ordinary, catalog-template and organization-template sheets in visible folders only', async () => {
    const visible = await folders.create(organizationId, admin, { name: 'Open', visibleToStaff: true });
    const hidden = await folders.create(organizationId, admin, { name: 'Closed' });
    const foreign = await folders.create(foreignOrganizationId, admin, { name: 'Foreign' });
    const source = await makeSheet(null, admin.id);
    const template = await checklists.createOrgTemplate(organizationId, { sourceChecklistId: source.id }, admin.id);
    const factories = [
      (folderId?: string | null) => checklists.createChecklist(createChecklistSchema.parse({ organizationId, title: 'New', folderId }), colleague.id),
      (folderId?: string | null) => checklists.createFromTemplate('shift-opening', 'ru', organizationId, colleague.id, folderId),
      (folderId?: string | null) => checklists.createFromOrgTemplate(template.id, organizationId, colleague.id, folderId),
    ];
    for (const create of factories) {
      expect(await create(visible.id)).toMatchObject({ folderId: visible.id });
      expect(await create()).toMatchObject({ folderId: null });
      for (const denied of [hidden.id, foreign.id, randomUUID()]) {
        const before = await prisma.checklist.count({ where: { organizationId } });
        await expect(create(denied)).rejects.toBeInstanceOf(NotFoundException);
        expect(await prisma.checklist.count({ where: { organizationId } })).toBe(before);
      }
    }
  });

  it('PR 407: searches across visible folders with ordered folder paths, status and soft-delete filtering', async () => {
    const parent = await folders.create(organizationId, admin, { name: 'Training', visibleToStaff: true });
    const child = await folders.create(organizationId, admin, { name: 'Safety', parentId: parent.id, visibleToStaff: true });
    const hidden = await folders.create(organizationId, admin, { name: 'Private' });
    const root = await makeSheet(null, admin.id, 'Safety briefing');
    const nested = await makeSheet(child.id, admin.id, 'SAFETY practice');
    const privateSheet = await makeSheet(hidden.id, admin.id, 'Safety hidden');
    const removed = await makeSheet(child.id, admin.id, 'Safety removed');
    await prisma.checklist.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
    await prisma.checklist.create({ data: { organizationId: foreignOrganizationId, title: 'Safety foreign' } });
    const rows = await checklists.listChecklists(organizationId, 'published', colleague, '  safety  ');
    expect(rows.map(({ id }) => id).sort()).toEqual([root.id, nested.id].sort());
    expect(rows.find(({ id }) => id === nested.id)?.folderPath).toEqual([{ id: parent.id, name: 'Training' }, { id: child.id, name: 'Safety' }]);
    expect(rows.find(({ id }) => id === root.id)?.folderPath).toEqual([]);
    expect(await checklists.listChecklists(organizationId, 'draft', colleague, 'safety')).toEqual([]);
    await prisma.checklistFolder.update({ where: { id: child.id }, data: { deletedAt: new Date() } });
    expect((await checklists.listChecklists(organizationId, undefined, admin, 'safety')).map(({ id }) => id).sort()).toEqual([root.id, privateSheet.id].sort());
  });

  it('PR 408: the list carries the live assignments count of each sheet (completed and deleted ones do not count)', async () => {
    const sheet = await makeSheet(null, admin.id, 'Counted sheet');
    const quiet = await makeSheet(null, admin.id, 'Quiet sheet');
    const base = { organizationId, checklistId: sheet.id, userId: colleague.id };
    await prisma.checklistInstance.createMany({ data: [
      { ...base, status: 'assigned' }, { ...base, status: 'in_progress' }, { ...base, status: 'submitted' },
      { ...base, status: 'completed' }, { ...base, status: 'assigned', deletedAt: new Date() },
    ] });
    const rows = await checklists.listChecklists(organizationId, undefined, admin);
    expect(rows.find(({ id }) => id === sheet.id)?.assignmentCount).toBe(3);
    expect(rows.find(({ id }) => id === quiet.id)?.assignmentCount).toBe(0);
  });

  it('PR 407: bulk move gives per-folder reasons and one audit record, with the single-folder target permissions', async () => {
    const destination = await folders.create(organizationId, author, { name: 'Destination' });
    const good = await folders.create(organizationId, author, { name: 'Good' });
    const conflict = await folders.create(organizationId, author, { name: 'Conflict' });
    await folders.create(organizationId, author, { name: 'CONFLICT', parentId: destination.id });
    const other = await folders.create(organizationId, colleague, { name: 'Others', visibleToStaff: true });
    const foreign = await folders.create(foreignOrganizationId, admin, { name: 'Foreign' });
    const result = await folders.bulk(organizationId, author, { action: 'move', ids: [good.id, conflict.id, other.id, foreign.id, good.id, destination.id], parentId: destination.id });
    expect(result).toMatchObject({ done: 1, skipped: 4, results: [
      { id: good.id, result: 'done' }, { id: conflict.id, reason: 'name_conflict' }, { id: other.id, reason: 'forbidden' }, { id: foreign.id, reason: 'not_found' }, { id: destination.id, reason: 'cycle' },
    ] });
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist.folder_bulk_move' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist.folder_updated' } })).toBe(0);
    await expect(folders.bulk(organizationId, author, { action: 'move', ids: [conflict.id], parentId: foreign.id })).rejects.toBeInstanceOf(NotFoundException);
    await expect(folders.bulk(organizationId, author, { action: 'move', ids: [conflict.id], parentId: other.id })).rejects.toBeInstanceOf(ForbiddenException);
    const deep = await chain(author, 5, 'Deep');
    expect(await folders.bulk(organizationId, author, { action: 'move', ids: [conflict.id], parentId: deep[4] })).toMatchObject({ done: 0, results: [{ reason: 'too_deep' }] });
    expect(await folders.bulk(organizationId, author, { action: 'move', ids: [deep[0]!], parentId: deep[4] })).toMatchObject({ results: [{ reason: 'cycle' }] });
  });

  it('PR 407: bulk delete counts overlapping subtrees once, preserves assigned sheets and records one audit', async () => {
    const parent = await folders.create(organizationId, author, { name: 'Parent' });
    const child = await folders.create(organizationId, author, { name: 'Child', parentId: parent.id });
    const plain = await makeSheet(child.id, author.id);
    const busy = await makeSheet(child.id, author.id);
    await prisma.checklistInstance.create({ data: { organizationId, checklistId: busy.id, userId: learner.id, assignedBy: admin.id, status: 'assigned' } });
    const foreign = await folders.create(foreignOrganizationId, admin, { name: 'Foreign' });
    const result = await folders.bulk(organizationId, author, { action: 'delete', ids: [child.id, parent.id, foreign.id] });
    expect(result).toMatchObject({ done: 1, skipped: 2, results: [{ id: child.id, reason: 'covered_by_parent' }, { id: parent.id, result: 'done' }, { id: foreign.id, reason: 'not_found' }], summary: { folders: 2, checklists: 1, movedToDraft: [{ id: busy.id }] } });
    expect(await prisma.checklist.findUnique({ where: { id: plain.id } })).toMatchObject({ deletedAt: expect.any(Date) });
    expect(await prisma.checklist.findUnique({ where: { id: busy.id } })).toMatchObject({ deletedAt: null, status: 'draft', folderId: null });
    expect(await folders.list(organizationId, author)).toMatchObject({ folders: [], checklistCount: 1 });
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist.folder_bulk_delete' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist.folder_deleted' } })).toBe(0);
  });

});
