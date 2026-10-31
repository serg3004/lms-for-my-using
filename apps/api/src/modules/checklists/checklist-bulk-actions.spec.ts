import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';

import { bulkChecklistActionSchema } from './checklists.schemas.js';
import { ChecklistBulkActions } from './checklist-bulk-actions.js';

type Row = { status: 'draft' | 'published' | 'archived'; createdBy: string | null; allowEditByAll: boolean; folderId?: string | null };
const org = '11111111-1111-1111-1111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const creator = { id: 'creator', roles: ['instructor'] as const };
const admin = { id: 'admin', roles: ['admin'] as const };

function setup(rows: Record<string, Row>, activeFor: string[] = []) {
  const prisma = {
    checklist: { findFirst: jest.fn(async ({ where }: { where: { id: string } }) => rows[where.id] ?? null) },
    checklistInstance: { findFirst: jest.fn(async ({ where }: { where: { checklistId: string } }) => (activeFor.includes(where.checklistId) ? { id: 'i' } : null)) },
  };
  const auditLog = { record: jest.fn(async () => undefined) };
  const operations = {
    setFolder: jest.fn<(id: string, org: string, folderId: string | null, actor: string) => Promise<undefined>>(async () => undefined),
    setStatus: jest.fn<(id: string, org: string, status: string, actor: string) => Promise<undefined>>(async () => undefined),
    remove: jest.fn<(id: string, org: string, actor: string) => Promise<undefined>>(async () => undefined),
  };
  const bulk = new ChecklistBulkActions(prisma as never, auditLog as never, operations);
  return { bulk, operations, auditLog };
}

describe('ChecklistBulkActions (PR 394)', () => {
  it('applies the action to what the caller may change and explains every skipped sheet', async () => {
    const own = uuid(1), foreign = uuid(2), shared = uuid(3), missing = uuid(4);
    const { bulk, operations } = setup({
      [own]: { status: 'published', createdBy: 'creator', allowEditByAll: false },
      [foreign]: { status: 'published', createdBy: 'someone', allowEditByAll: false },
      [shared]: { status: 'published', createdBy: 'someone', allowEditByAll: true },
    });
    const result = await bulk.run('archive', [own, foreign, shared, missing], org, creator);
    expect(result.done).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.results).toEqual([
      { id: own, result: 'done' },
      { id: foreign, result: 'skipped', reason: 'forbidden' },
      { id: shared, result: 'done' },
      { id: missing, result: 'skipped', reason: 'not_found' },
    ]);
    expect(operations.setStatus).toHaveBeenCalledTimes(2);
    expect(operations.setStatus).toHaveBeenCalledWith(own, org, 'archived', 'creator');
  });

  it('lets an admin change a sheet of another author even when editing is restricted', async () => {
    const id = uuid(1);
    const { bulk } = setup({ [id]: { status: 'draft', createdBy: 'someone', allowEditByAll: false } });
    expect((await bulk.run('publish', [id], org, admin)).done).toBe(1);
  });

  it('skips a sheet already in the target status and reports a failed publish check with its message', async () => {
    const same = uuid(1), empty = uuid(2);
    const { bulk, operations } = setup({
      [same]: { status: 'archived', createdBy: 'creator', allowEditByAll: true },
      [empty]: { status: 'draft', createdBy: 'creator', allowEditByAll: true },
    });
    operations.setStatus.mockRejectedValueOnce(new BadRequestException('Cannot publish checklist: it has no items'));
    const archived = await bulk.run('archive', [same], org, creator);
    expect(archived.results[0]).toEqual({ id: same, result: 'skipped', reason: 'already_in_status' });
    const published = await bulk.run('publish', [empty], org, creator);
    expect(published.results[0]).toEqual({ id: empty, result: 'skipped', reason: 'cannot_publish', message: 'Cannot publish checklist: it has no items' });
  });

  it('deletes free sheets, and turns a sheet with active assignments into a draft instead', async () => {
    const free = uuid(1), busy = uuid(2);
    const { bulk, operations } = setup({
      [free]: { status: 'published', createdBy: 'creator', allowEditByAll: true },
      [busy]: { status: 'published', createdBy: 'creator', allowEditByAll: true },
    }, [busy]);
    const result = await bulk.run('delete', [free, busy, free], org, creator);
    expect(result.results).toEqual([
      { id: free, result: 'done' },
      { id: busy, result: 'skipped', reason: 'moved_to_draft' },
    ]);
    expect(operations.remove).toHaveBeenCalledTimes(1);
    expect(operations.setStatus).toHaveBeenCalledWith(busy, org, 'draft', 'creator');
  });

  it('writes one summary audit record for the operation', async () => {
    const id = uuid(1);
    const { bulk, auditLog } = setup({ [id]: { status: 'draft', createdBy: 'creator', allowEditByAll: true } });
    await bulk.run('publish', [id], org, creator);
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist.bulk', metadata: { action: 'publish', requested: 1, done: 1 } }));
  });
});

describe('ChecklistBulkActions move (PR 395)', () => {
  it('moves sheets into a folder or to the root, skips those already there and keeps the edit rights', async () => {
    const free = uuid(1), there = uuid(2), foreign = uuid(3), folder = uuid(9);
    const { bulk, operations } = setup({
      [free]: { status: 'draft', createdBy: 'creator', allowEditByAll: false, folderId: null },
      [there]: { status: 'draft', createdBy: 'creator', allowEditByAll: false, folderId: folder },
      [foreign]: { status: 'draft', createdBy: 'someone', allowEditByAll: false, folderId: null },
    });
    const result = await bulk.run('move', [free, there, foreign], org, creator, folder);
    expect(result.results).toEqual([
      { id: free, result: 'done' },
      { id: there, result: 'skipped', reason: 'already_in_folder' },
      { id: foreign, result: 'skipped', reason: 'forbidden' },
    ]);
    expect(operations.setFolder).toHaveBeenCalledWith(free, org, folder, 'creator');
    const toRoot = await bulk.run('move', [there], org, creator, null);
    expect(toRoot.results[0]).toEqual({ id: there, result: 'done' });
    expect(operations.setFolder).toHaveBeenLastCalledWith(there, org, null, 'creator');
  });

  it('requires folderId for a move in the request schema, where null means the root', () => {
    expect(bulkChecklistActionSchema.safeParse({ action: 'move', ids: [uuid(1)] }).success).toBe(false);
    expect(bulkChecklistActionSchema.safeParse({ action: 'move', ids: [uuid(1)], folderId: null }).success).toBe(true);
    expect(bulkChecklistActionSchema.safeParse({ action: 'move', ids: [uuid(1)], folderId: uuid(2) }).success).toBe(true);
  });
});

describe('bulkChecklistActionSchema (PR 394)', () => {
  it('accepts up to 100 ids and rejects more, empty lists and unknown actions', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => uuid(i + 1));
    expect(bulkChecklistActionSchema.safeParse({ action: 'delete', ids: ids(100) }).success).toBe(true);
    expect(bulkChecklistActionSchema.safeParse({ action: 'delete', ids: ids(101) }).success).toBe(false);
    expect(bulkChecklistActionSchema.safeParse({ action: 'delete', ids: [] }).success).toBe(false);
    expect(bulkChecklistActionSchema.safeParse({ action: 'move', ids: ids(1) }).success).toBe(false);
  });
});
