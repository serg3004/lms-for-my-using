// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssessmentFolder } from '../../shared/api/assessmentFolders.js';
import { AssessmentLibrary } from './AssessmentLibrary.js';
import type { useAssessmentFolders } from './useAssessmentFolders.js';
import type { AssessmentListRow, useAssessmentList } from './useAssessmentList.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, 'requestAnimationFrame', { writable: true, value: (callback: () => void) => { callback(); return 0; } });
Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
const t = ((key: string, options?: Record<string, unknown>) => (typeof options?.name === 'string' ? `${key}:${options.name}` : key)) as unknown as TFunction;

const folder: AssessmentFolder = { id: 'f1', name: 'Safety', parentId: null, color: 'purple', childFolderCount: 0, assessmentCount: 0, totalAssessmentCount: 0 };
const test = (id: string, title: string, extra: Partial<AssessmentListRow> = {}) => ({ id, title, folderId: null, isLongreadExercise: false, ...extra }) as unknown as AssessmentListRow;

function mount(items: AssessmentListRow[]) {
  const select = vi.fn();
  const list = { page: { items, total: items.length, page: 1, pageSize: 25 }, filtering: false, folder: 'root', key: 'k', tableSort: undefined, set: vi.fn(), reload: vi.fn(), loading: false, error: false } as unknown as ReturnType<typeof useAssessmentList>;
  const library = { data: { folders: [folder], assessmentCount: items.length, rootAssessmentCount: items.length }, id: null, status: 'loaded', stale: false, select, reload: vi.fn(), rootLabel: 'Root', expanded: new Set<string>(), toggle: vi.fn() } as unknown as ReturnType<typeof useAssessmentFolders>;
  const host = document.createElement('div');
  document.body.append(host);
  const columns = [{ key: 'title', label: 'Title', priority: 'primary' as const, render: (row: AssessmentListRow) => row.title }];
  act(() => createRoot(host).render(<AssessmentLibrary list={list} library={library} columns={columns} renderActions={() => null} t={t} />));
  return { host, select };
}
const row = (host: HTMLElement, key: string) => host.querySelector<HTMLElement>(`tr[data-row-key="${key}"]`);
const items = () => Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]')).map((item) => item.textContent);
function rightClick(element: Element) {
  act(() => { element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 })); });
}

describe('AssessmentLibrary context menu (PR 580)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('opens the folder menu on a right click, like the checklist library', () => {
    const { host, select } = mount([test('a1', 'Fire safety')]);
    rightClick(row(host, 'folder:f1')!);
    expect(items()).toEqual([
      'admin.checklists.folders.open', 'admin.assessmentBuilder.folders.settings', 'admin.checklists.contextMenu.newInside',
      'admin.checklists.folders.moveOpen', 'admin.checklists.folders.delete',
    ]);
    act(() => { (document.querySelectorAll('[role="menu"] [role="menuitem"]')[0] as HTMLElement).click(); });
    expect(select).toHaveBeenCalledWith('f1');
  });

  it('offers only "move" on a test row and nothing on a longread exercise', () => {
    const { host } = mount([test('a1', 'Fire safety'), test('a2', 'Exercise', { isLongreadExercise: true })]);
    rightClick(row(host, 'assessment:a1')!);
    expect(items()).toEqual(['admin.checklists.folders.moveOpen']);
    expect(row(host, 'assessment:a2')).toBeNull();
  });
});
