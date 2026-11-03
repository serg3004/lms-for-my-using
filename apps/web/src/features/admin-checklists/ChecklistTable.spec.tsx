import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import type { ChecklistFolder, ChecklistStatus, ChecklistSummary } from '../../shared/api/types.js';
import { ChecklistTable, creatorName } from './ChecklistTable.js';
import { checklistStatusAction } from './domain.js';

const t = ((key: string, fallback?: string) => fallback ?? key) as unknown as TFunction;
const statusLabels = { draft: 'Draft', published: 'Published', archived: 'Archived' };
const scoringModeLabels = { sum_points: 'Sum', all_required: 'All', scale: 'Scale' };

function render(status: ChecklistStatus) {
  const checklist = { id: 'c1', title: 'Opening shift', status, scoringMode: 'sum_points', items: [] } as unknown as ChecklistSummary;
  return renderToStaticMarkup(
    <ChecklistTable
      onCopy={vi.fn()}
      onDelete={vi.fn()}
      onEdit={vi.fn()}
      onStatusChange={vi.fn()}
      rows={[checklist]}
      scoringModeLabels={scoringModeLabels}
      statusLabels={statusLabels}
      t={t}
    />,
  );
}

describe('checklistStatusAction (PR 327)', () => {
  it('publishes a draft, and sends published and archived checklists back to draft (never straight to published)', () => {
    expect(checklistStatusAction('draft')).toBe('published');
    expect(checklistStatusAction('published')).toBe('draft');
    expect(checklistStatusAction('archived')).toBe('draft');
  });
});

describe('ChecklistTable (PR 327)', () => {
  it('shows the status as a badge with an explicit next-step button instead of a dropdown', () => {
    const html = render('draft');
    expect(html).toContain('ds-badge');
    expect(html).toContain('>Draft<');
    expect(html).toContain('>Publish<');
    expect(html).not.toContain('<select');
  });

  it('offers "move to draft" for a published checklist and "restore as draft" for an archived one', () => {
    expect(render('published')).toContain('>Move to draft<');
    expect(render('archived')).toContain('>Restore as draft<');
  });

  it('keeps Edit and Copy as primary actions; Delete and Archive are behind the row menu', () => {
    const html = render('published');
    expect(html).toContain('>Edit<');
    expect(html).toContain('>Copy<');
    // Menu items are only rendered once the menu is open, so Delete must not be a visible button.
    expect(html).not.toContain('>Delete<');
    expect(html).toContain('aria-haspopup');
  });
});

describe('ChecklistTable author and date (PR 393)', () => {
  it('shows the creator name and creation time, and a dash when the author is gone', () => {
    const rows = [
      { id: 'c1', title: 'A', status: 'draft', scoringMode: 'sum_points', items: [], createdAt: '2026-10-01T16:47:00.000Z', creator: { id: 'u1', firstName: 'Анна', lastName: 'Орлова' } },
      { id: 'c2', title: 'B', status: 'draft', scoringMode: 'sum_points', items: [], createdAt: '2026-10-02T10:00:00.000Z', creator: null },
    ] as unknown as ChecklistSummary[];
    const html = renderToStaticMarkup(
      <ChecklistTable onCopy={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} onStatusChange={vi.fn()} rows={rows} scoringModeLabels={scoringModeLabels} statusLabels={statusLabels} t={t} />,
    );
    expect(html).toContain('>Created by<');
    expect(html).toContain('>Created<');
    expect(html).toContain('Анна Орлова');
    expect(html).toContain('>—<');
  });

  it('marks a checklist that has its own module settings, and only that one (PR 397)', () => {
    const rows = [
      { id: 'c1', title: 'A', status: 'draft', scoringMode: 'sum_points', items: [], createdAt: '2026-10-01T16:47:00.000Z', hasModuleOverrides: true },
      { id: 'c2', title: 'B', status: 'draft', scoringMode: 'sum_points', items: [], createdAt: '2026-10-02T10:00:00.000Z', hasModuleOverrides: false },
    ] as unknown as ChecklistSummary[];
    const html = renderToStaticMarkup(
      <ChecklistTable onCopy={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} onStatusChange={vi.fn()} rows={rows} scoringModeLabels={scoringModeLabels} statusLabels={statusLabels} t={t} />,
    );
    expect(html.match(/Own module settings/g)).toHaveLength(1);
  });

  it('creatorName falls back to a dash for a missing or blank author', () => {
    expect(creatorName({ creator: undefined })).toBe('—');
    expect(creatorName({ creator: { id: 'u', firstName: '', lastName: '' } })).toBe('—');
    expect(creatorName({ creator: { id: 'u', firstName: 'Анна', lastName: '' } })).toBe('Анна');
  });
});

describe('ChecklistTable library rows (PR 408)', () => {
  const folder = (id: string, name: string, extra: Partial<ChecklistFolder> = {}): ChecklistFolder => ({
    id, parentId: null, name, visibleToStaff: true, createdBy: 'u', createdAt: '2026-10-01T10:00:00.000Z', canManage: true, checklistCount: 0, totalChecklistCount: 0,
    creator: { id: 'u', firstName: 'Анна', lastName: 'Орлова' }, ...extra,
  });
  const sheet = (id: string, title: string, folderId: string | null, assignmentCount = 0) => ({ id, title, status: 'draft', scoringMode: 'sum_points', items: [], createdAt: '2026-10-02T10:00:00.000Z', folderId, assignmentCount }) as unknown as ChecklistSummary;
  const folders = [folder('a', 'Магазин'), folder('b', 'Касса', { parentId: 'a', visibleToStaff: false, canManage: false }), folder('c', 'Склад')];
  const sheets = [sheet('s1', 'Открытие смены', 'b', 2), sheet('s2', 'Уборка', 'a', 3), sheet('s3', 'Без папки', null)];
  const tFill = ((key: string, fallback?: string | Record<string, unknown>, options?: Record<string, unknown>) => {
    const text = typeof fallback === 'string' ? fallback : key;
    return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? ''));
  }) as unknown as TFunction;
  const renderLibrary = (extra: Partial<React.ComponentProps<typeof ChecklistTable>> = {}) => renderToStaticMarkup(
    <ChecklistTable childFolders={[folders[0]!, folders[2]!]} allSheets={sheets} folders={folders} rows={[sheets[2]!]} onCopy={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} onStatusChange={vi.fn()}
      onOpenFolder={vi.fn()} onRenameFolder={vi.fn()} scoringModeLabels={scoringModeLabels} statusLabels={statusLabels} t={tFill} {...extra} />,
  );

  it('puts the folders above the checklists with type, contents and the assignments of the folder with its subfolders', () => {
    const html = renderLibrary();
    expect(html.indexOf('Магазин')).toBeLessThan(html.indexOf('Склад'));
    expect(html.indexOf('Склад')).toBeLessThan(html.indexOf('Без папки'));
    expect(html).toContain('>Type<');
    expect(html).toContain('>Assignments<');
    expect(html).toContain('>Folder<');
    expect(html).toContain('Folders: 1, checklists: 1');
    // Магазин: its own sheet (3) plus the sheet of the subfolder Касса (2).
    expect(html).toContain('>5<');
    expect(html).toContain('aria-label="Open folder: Магазин"');
  });

  it('shows the folder path column only in search mode, and a closed folder with a lock', () => {
    expect(renderLibrary()).not.toContain('>Folder</th>');
    const searching = renderLibrary({ showFolderPath: true, childFolders: [], rows: [sheets[0]!] });
    expect(searching).toContain('Магазин / Касса');
    expect(renderLibrary({ childFolders: [folders[1]!] })).toContain('Closed folder');
  });

  it('offers a checkbox on every folder and checklist row and one in the header to select the whole open folder (PR 410)', () => {
    const html = renderLibrary({ selectedKeys: new Set<string>(), onSelectionChange: vi.fn() });
    expect(html.match(/type="checkbox"/g)).toHaveLength(1 + 3);
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-label="Select folder: Магазин"');
    expect(html).toContain('aria-label="Select all folders and checklists in this folder"');
  });

  it('says the folder is empty with the given message', () => {
    expect(renderLibrary({ childFolders: [], rows: [], emptyMessage: 'This folder is empty.' })).toContain('This folder is empty.');
  });
});
