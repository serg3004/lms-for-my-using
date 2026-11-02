import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import { ApiClientError } from '../../shared/apiClient.js';
import type { ChecklistFolder } from '../../shared/api/types.js';
import { ancestorIds, canAddSubfolder, deleteImpactMessage, folderErrorMessage, folderPathLabel, folderRows, folderAndDescendantIds, folderAssignmentTotal, folderDirectCounts, libraryContents, resolveSelectedFolder } from './folders.js';

const t = ((key: string, fallbackOrOptions?: string | Record<string, unknown>, options?: Record<string, unknown>) => {
  const fallback = typeof fallbackOrOptions === 'string' ? fallbackOrOptions : key;
  const values = (typeof fallbackOrOptions === 'string' ? options : fallbackOrOptions) ?? {};
  return fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ''));
}) as unknown as TFunction;

const folder = (id: string, parentId: string | null, name: string): ChecklistFolder => ({
  id, parentId, name, visibleToStaff: true, createdBy: 'u', createdAt: '2026-10-31T00:00:00.000Z', canManage: true, checklistCount: 0, totalChecklistCount: 0,
});
const tree = [folder('b', 'a', 'Касса'), folder('a', null, 'Магазин'), folder('c', null, 'Склад'), folder('d', 'b', 'Смена')];

describe('checklist folder helpers (PR 396)', () => {
  it('lists folders in tree order with levels, siblings sorted by name', () => {
    expect(folderRows(tree).map((row) => [row.folder.id, row.level])).toEqual([['a', 1], ['b', 2], ['d', 3], ['c', 1]]);
  });

  it('hides the children of a collapsed folder', () => {
    expect(folderRows(tree, new Set(['a'])).map((row) => row.folder.id)).toEqual(['a', 'b', 'c']);
    expect(folderRows(tree, new Set()).map((row) => row.folder.id)).toEqual(['a', 'c']);
  });

  it('shows a folder whose parent is not visible at the top instead of dropping it', () => {
    expect(folderRows([folder('x', 'hidden-parent', 'Orphan')]).map((row) => [row.folder.id, row.level])).toEqual([['x', 1]]);
  });

  it('builds the path, the ancestors and the limit for subfolders', () => {
    expect(folderPathLabel(tree, 'd')).toBe('Магазин / Касса / Смена');
    expect(folderPathLabel(tree, null)).toBe('');
    expect(ancestorIds(tree, 'd')).toEqual(['a', 'b']);
    expect(canAddSubfolder(tree, 'd')).toBe(true);
    const deep = ['1', '2', '3', '4', '5'].map((id, index) => folder(id, index === 0 ? null : String(index), `L${id}`));
    expect(canAddSubfolder(deep, '5')).toBe(false);
    expect(canAddSubfolder(deep, '4')).toBe(true);
    expect(canAddSubfolder(deep, null)).toBe(true);
  });

  it('falls back to "all checklists" for a folder that is gone', () => {
    expect(resolveSelectedFolder(tree, 'b')).toBe('b');
    expect(resolveSelectedFolder(tree, 'deleted')).toBeNull();
    expect(resolveSelectedFolder(tree, null)).toBeNull();
  });

  it('shows only the direct subfolders and sheets of the open folder, folders sorted by name (PR 408)', () => {
    const sheets = [{ id: '1', folderId: 'a' }, { id: '2', folderId: 'b' }, { id: '3', folderId: null }, { id: '4' }, { id: '5', folderId: 'hidden' }];
    const root = libraryContents(tree, sheets, null);
    expect(root.folders.map(({ id }) => id)).toEqual(['a', 'c']);
    expect(root.sheets.map(({ id }) => id)).toEqual(['3', '4', '5']);
    const shop = libraryContents(tree, sheets, 'a');
    expect(shop.folders.map(({ id }) => id)).toEqual(['b']);
    expect(shop.sheets.map(({ id }) => id)).toEqual(['1']);
    expect(libraryContents(tree, sheets, 'c')).toEqual({ folders: [], sheets: [] });
  });

  it('counts the folder contents and the live assignments with subfolders (PR 408)', () => {
    const sheets = [{ folderId: 'a', assignmentCount: 2 }, { folderId: 'b', assignmentCount: 3 }, { folderId: 'd' }, { folderId: 'c', assignmentCount: 7 }, { folderId: null, assignmentCount: 1 }];
    expect([...folderAndDescendantIds(tree, 'a')].sort()).toEqual(['a', 'b', 'd']);
    expect(folderAssignmentTotal(tree, sheets, 'a')).toBe(5);
    expect(folderAssignmentTotal(tree, sheets, 'c')).toBe(7);
    expect(folderDirectCounts(tree, sheets, 'a')).toEqual({ folders: 1, sheets: 1 });
    expect(folderDirectCounts(tree, sheets, 'b')).toEqual({ folders: 1, sheets: 1 });
  });

  it('states what a folder deletion removes and names the sheets that become drafts', () => {
    const plain = deleteImpactMessage('Магазин', { folders: 3, checklists: 5, movedToDraft: [] }, t);
    expect(plain).toContain('Магазин');
    expect(plain).toContain('Folders: 3');
    expect(plain).toContain('checklists to be deleted: 5');
    const withBusy = deleteImpactMessage('Магазин', { folders: 1, checklists: 0, movedToDraft: [{ id: 'x', title: 'Открытие' }] }, t);
    expect(withBusy).toContain('«Открытие»');
  });

  it('turns the server errors into plain text', () => {
    const error = (status: number, message: string) => new ApiClientError(message, status);
    expect(folderErrorMessage(error(409, 'dup'), t)).toContain('already exists');
    expect(folderErrorMessage(error(404, 'x'), t)).toContain('no longer exists');
    expect(folderErrorMessage(error(403, 'x'), t)).toContain('creator');
    expect(folderErrorMessage(error(400, 'Folders can be nested at most 5 levels deep'), t)).toContain('5 levels');
    expect(folderErrorMessage(error(400, 'A folder cannot be moved into itself or into one of its subfolders'), t)).toContain('into itself');
    expect(folderErrorMessage(new Error('boom'), t)).toContain('failed');
  });
});
