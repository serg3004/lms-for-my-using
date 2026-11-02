import { randomUUID } from 'node:crypto';
import { rolesMetadataKey } from '../auth/public.js';
import { ChecklistFoldersController } from './checklist-folders.controller.js';
import { bulkChecklistFolderSchema, checklistListQuerySchema, createChecklistSchema, createChecklistFromTemplateSchema, createChecklistFromOrgTemplateSchema } from './checklists.schemas.js';

describe('folder library request contracts (PR 407)', () => {
  it('accepts a folder or root for each way of creating a sheet and rejects malformed folder ids', () => {
    const folderId = randomUUID();
    for (const [schema, body] of [
      [createChecklistSchema, { organizationId: randomUUID(), title: 'Sheet' }],
      [createChecklistFromTemplateSchema, { templateKey: 'shift-opening' }],
      [createChecklistFromOrgTemplateSchema, { templateId: randomUUID() }],
    ] as const) {
      expect(schema.parse({ ...body, folderId })).toMatchObject({ folderId });
      expect(schema.parse({ ...body, folderId: null })).toMatchObject({ folderId: null });
      expect(schema.safeParse(body).success).toBe(true);
      expect(schema.safeParse({ ...body, folderId: 'not-a-uuid' }).success).toBe(false);
    }
  });

  it('requires an explicit move target, validates ids and limits a bulk operation to 100 folders', () => {
    const ids = [randomUUID()];
    expect(bulkChecklistFolderSchema.parse({ ids, action: 'move', parentId: null })).toMatchObject({ parentId: null });
    expect(bulkChecklistFolderSchema.safeParse({ ids, action: 'delete' }).success).toBe(true);
    for (const body of [
      { ids, action: 'move' }, { ids: [], action: 'delete' }, { ids: Array.from({ length: 101 }, () => randomUUID()), action: 'delete' },
      { ids: ['invalid'], action: 'delete' }, { ids, action: 'move', parentId: 'invalid' }, { ids, action: 'publish' },
    ]) expect(bulkChecklistFolderSchema.safeParse(body).success).toBe(false);
    expect(bulkChecklistFolderSchema.safeParse({ ids: Array.from({ length: 100 }, () => randomUUID()), action: 'delete' }).success).toBe(true);
  });

  it('normalizes and bounds title search independently of the status filter', () => {
    expect(checklistListQuerySchema.parse({ search: '  Safety  ', status: 'draft' })).toEqual({ search: 'Safety', status: 'draft' });
    expect(checklistListQuerySchema.safeParse({ search: 'x'.repeat(201) }).success).toBe(false);
  });

  it('keeps bulk folder mutation restricted to the four staff authoring roles', () => {
    expect(Reflect.getMetadata(rolesMetadataKey, ChecklistFoldersController.prototype.bulk)).toEqual(['admin', 'manager', 'instructor', 'mentor']);
  });
});
