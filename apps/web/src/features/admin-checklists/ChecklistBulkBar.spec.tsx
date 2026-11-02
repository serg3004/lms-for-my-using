import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import type { ChecklistBulkResult, ChecklistFolder, ChecklistFolderBulkResult, ChecklistSummary } from '../../shared/api/types.js';
import { ChecklistBulkBar, bulkDeleteMessage, bulkResultSummary, folderBulkResultSummary, mergeBulkReports, selectionDeleteMessage } from './ChecklistBulkBar.js';

const t = ((key: string, fallbackOrOptions?: string | Record<string, unknown>, options?: Record<string, unknown>) => {
  const fallback = typeof fallbackOrOptions === 'string' ? fallbackOrOptions : key;
  const values = (typeof fallbackOrOptions === 'string' ? options : fallbackOrOptions) ?? {};
  return fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ''));
}) as unknown as TFunction;
const sheet = (id: string, title: string) => ({ id, title }) as ChecklistSummary;

function render(selected: ChecklistSummary[]) {
  return renderToStaticMarkup(<ChecklistBulkBar busy={false} onAction={vi.fn()} onCopy={vi.fn()} onEdit={vi.fn()} selected={selected} t={t} />);
}

describe('ChecklistBulkBar (PR 394)', () => {
  it('enables Edit and Copy only for exactly one selected checklist', () => {
    const one = render([sheet('a', 'A')]);
    expect(one).toMatch(/<button[^>]*>Edit<\/button>/);
    expect(one).not.toMatch(/disabled=""[^>]*>Edit</);
    const two = render([sheet('a', 'A'), sheet('b', 'B')]);
    expect(two).toMatch(/disabled=""[^>]*>Edit</);
    expect(two).toMatch(/disabled=""[^>]*>Copy</);
    expect(two).toContain('>Publish<');
    expect(two).toContain('>Archive<');
    expect(two).toContain('>Delete<');
  });
});

describe('bulk delete confirmation and result (PR 394)', () => {
  it('lists up to ten titles and counts the rest', () => {
    const many = Array.from({ length: 12 }, (_, i) => sheet(`id${i}`, `Sheet ${i}`));
    const message = bulkDeleteMessage(many, t);
    expect(message).toContain('«Sheet 0»');
    expect(message).toContain('«Sheet 9»');
    expect(message).not.toContain('«Sheet 10»');
    expect(message).toContain('and 2 more');
    expect(message).toContain('12');
  });

  it('summarizes done and skipped counts with a reason per skipped checklist', () => {
    const result: ChecklistBulkResult = {
      action: 'delete', done: 1, skipped: 2,
      results: [{ id: 'a', result: 'done' }, { id: 'b', result: 'skipped', reason: 'forbidden' }, { id: 'c', result: 'skipped', reason: 'moved_to_draft' }],
    };
    const summary = bulkResultSummary(result, new Map([['b', 'Closing'], ['c', 'Opening']]), t);
    expect(summary.headline).toBe('Done: 1, skipped: 2');
    expect(summary.skipped).toHaveLength(2);
    expect(summary.skipped[0]?.text).toContain('«Closing»');
    expect(summary.skipped[1]?.text).toContain('moved to drafts');
  });
});

const folder = (id: string, name: string, canManage = true) => ({ id, name, canManage, parentId: null, visibleToStaff: true }) as ChecklistFolder;
const renderMixed = (sheets: ChecklistSummary[], folders: ChecklistFolder[]) => renderToStaticMarkup(
  <ChecklistBulkBar busy={false} onAction={vi.fn()} onCopy={vi.fn()} onEdit={vi.fn()} onMove={vi.fn()} onRenameFolder={vi.fn()} onDeleteSelection={vi.fn()} selected={sheets} selectedFolders={folders} t={t} />,
);

describe('ChecklistBulkBar with folders (PR 410)', () => {
  it('offers "Rename folder" only for exactly one selected folder that the caller may change', () => {
    expect(renderMixed([], [folder('f1', 'Касса')])).toContain('>Rename folder<');
    expect(renderMixed([], [folder('f1', 'Касса'), folder('f2', 'Склад')])).not.toContain('Rename folder');
    expect(renderMixed([], [folder('f1', 'Касса', false)])).not.toContain('Rename folder');
    expect(renderMixed([sheet('a', 'A')], [folder('f1', 'Касса')])).not.toContain('Rename folder');
  });

  it('keeps only Move and Delete for a selection with folders and explains the disabled actions', () => {
    const html = renderMixed([sheet('a', 'A')], [folder('f1', 'Касса')]);
    expect(html).toContain('>Move to folder…<');
    expect(html).not.toMatch(/disabled=""[^>]*>Move to folder/);
    expect(html).not.toMatch(/disabled=""[^>]*>Delete</);
    for (const label of ['Edit', 'Copy', 'Publish', 'Move to draft', 'Archive']) expect(html).toMatch(new RegExp(`disabled=""[^>]*title="Not available for folders"[^>]*>${label}<|title="Not available for folders"[^>]*disabled=""[^>]*>${label}<`));
    expect(html).toContain('role="note"');
  });

  it('stays as before for checklists only', () => {
    const html = renderMixed([sheet('a', 'A'), sheet('b', 'B')], []);
    expect(html).not.toContain('role="note"');
    expect(html).not.toMatch(/disabled=""[^>]*>Publish</);
  });
});

describe('folder bulk report and delete confirmation (PR 410)', () => {
  it('names a folder and gives the reason for each skipped one, and merges two reports into one', () => {
    const folderResult: ChecklistFolderBulkResult = {
      action: 'move', done: 1, skipped: 3,
      results: [{ id: 'f1', result: 'done' }, { id: 'f2', result: 'skipped', reason: 'name_conflict' }, { id: 'f3', result: 'skipped', reason: 'too_deep' }, { id: 'f4', result: 'skipped', reason: 'cycle' }],
    };
    const report = folderBulkResultSummary(folderResult, new Map([['f2', 'Касса'], ['f3', 'Склад'], ['f4', 'Офис']]), t);
    expect(report.headline).toBe('Done: 1, skipped: 3');
    expect(report.skipped.map((line) => line.text)).toEqual([
      'Folder «Касса»: a folder with this name already exists there',
      'Folder «Склад»: folders can be nested at most 5 levels deep',
      'Folder «Офис»: a folder cannot be moved into itself or into its subfolder',
    ]);
    const sheetResult: ChecklistBulkResult = { action: 'move', done: 2, skipped: 1, results: [{ id: 'a', result: 'skipped', reason: 'forbidden' }] };
    const merged = mergeBulkReports([bulkResultSummary(sheetResult, new Map([['a', 'A']]), t), report], [sheetResult, folderResult], t);
    expect(merged.headline).toBe('Done: 3, skipped: 4');
    expect(merged.skipped).toHaveLength(4);
  });

  it('states the totals up front and names the checklists that stay as drafts', () => {
    const plain = selectionDeleteMessage({ folders: 3, checklists: 4, movedToDraft: [] }, 2, t);
    expect(plain).toContain('Folders (with everything inside): 3');
    expect(plain).toContain('checklists: 6');
    expect(plain).not.toContain('moved to drafts');
    const withBusy = selectionDeleteMessage({ folders: 1, checklists: 0, movedToDraft: [{ id: 'x', title: 'Открытие' }] }, 0, t);
    expect(withBusy).toContain('«Открытие»');
  });
});
