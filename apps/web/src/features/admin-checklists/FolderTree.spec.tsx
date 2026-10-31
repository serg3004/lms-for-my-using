import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import type { ChecklistFolder } from '../../shared/api/types.js';
import { FolderTree } from './FolderTree.js';

const t = ((key: string, fallbackOrOptions?: string | Record<string, unknown>, options?: Record<string, unknown>) => {
  const fallback = typeof fallbackOrOptions === 'string' ? fallbackOrOptions : key;
  const values = (typeof fallbackOrOptions === 'string' ? options : fallbackOrOptions) ?? {};
  return fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ''));
}) as unknown as TFunction;
const folder = (id: string, parentId: string | null, name: string, extra: Partial<ChecklistFolder> = {}): ChecklistFolder => ({
  id, parentId, name, visibleToStaff: false, createdBy: 'u', createdAt: '2026-10-31T00:00:00.000Z', canManage: true, checklistCount: 1, totalChecklistCount: 2, ...extra,
});

function render(folders: ChecklistFolder[], selectedId: string | null = null, expanded: string[] = folders.map((item) => item.id)) {
  return renderToStaticMarkup(
    <FolderTree expandedIds={new Set(expanded)} folders={folders} onCreateSubfolder={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} onSelect={vi.fn()} onToggle={vi.fn()} selectedId={selectedId} t={t} totalCount={7} />,
  );
}

describe('FolderTree (PR 396)', () => {
  it('is a tree whose first item is "All checklists" with the total count', () => {
    const html = render([folder('a', null, 'Магазин')]);
    expect(html).toContain('role="tree"');
    expect(html).toContain('All checklists');
    expect(html).toContain('>7<');
    expect((html.match(/role="treeitem"/g) ?? []).length).toBe(2);
  });

  it('marks levels, expansion and the selected item for assistive technology', () => {
    const html = render([folder('a', null, 'Магазин'), folder('b', 'a', 'Касса')], 'b');
    expect(html).toContain('aria-level="2"');
    expect(html).toContain('aria-level="3"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toMatch(/aria-selected="true"[^>]*tabindex="0"/);
  });

  it('shows a lock with a text label on a closed folder only', () => {
    expect(render([folder('a', null, 'Закрытая')])).toContain('🔒');
    expect(render([folder('a', null, 'Открытая', { visibleToStaff: true })])).not.toContain('🔒');
    expect(render([folder('a', null, 'Закрытая')])).toContain('Closed folder');
  });

  it('offers the folder menu only for folders the caller manages and hides collapsed children', () => {
    expect(render([folder('a', null, 'Чужая', { canManage: false })])).not.toContain('Folder actions');
    expect(render([folder('a', null, 'Моя')])).toContain('Folder actions: Моя');
    const collapsed = render([folder('a', null, 'Магазин'), folder('b', 'a', 'Касса')], null, []);
    expect(collapsed).toContain('Магазин');
    expect(collapsed).not.toContain('Касса');
  });
});
