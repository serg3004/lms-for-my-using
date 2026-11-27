// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LibraryFolder } from '../api/libraryFolders.js';
import { FolderLibraryTable } from './FolderLibraryTable.js';
import type { LibraryFolders } from './useLibraryFolders.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, 'requestAnimationFrame', { writable: true, value: (callback: () => void) => { callback(); return 0; } });
Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
const t = ((key: string, options?: Record<string, unknown>) => (typeof options?.name === 'string' ? `${key}:${options.name}` : key)) as unknown as TFunction;

const folder: LibraryFolder = { id: 'f1', name: 'Safety', parentId: null, color: 'purple', childFolderCount: 0, itemCount: 1, totalItemCount: 1 };
type Item = { id: string; title: string; folderId: string | null };

function mount(items: Item[], scope: 'course' | 'assignment' = 'course') {
  const select = vi.fn();
  const library = { scope, status: 'loaded', data: { folders: [folder], rootItemCount: items.length }, id: null, stale: false, select, reload: vi.fn(), toggle: vi.fn(), expanded: new Set<string>() } as unknown as LibraryFolders;
  const host = document.createElement('div');
  document.body.append(host);
  const columns = [{ key: 'title', label: 'Title', priority: 'primary' as const, render: (item: Item) => item.title }];
  act(() => createRoot(host).render(
    <FolderLibraryTable<Item> library={library} items={items} columns={columns} itemTitle={(item) => item.title} showFolders afterChange={vi.fn()} emptyMessage="empty" label="list" t={t} />,
  ));
  return { host, select };
}
const row = (host: HTMLElement, key: string) => host.querySelector<HTMLElement>(`tr[data-row-key="${key}"]`);
const items = () => Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]')).map((item) => item.textContent);
function rightClick(element: Element) {
  act(() => { element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 })); });
}

describe('FolderLibraryTable (PR 581)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('shows folder rows above the items and opens a folder from its menu', () => {
    const { host, select } = mount([{ id: 'c1', title: 'Fire safety', folderId: null }]);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(host.querySelector('tbody tr')?.getAttribute('data-row-key')).toBe('folder:f1');
    rightClick(row(host, 'folder:f1')!);
    expect(items()[0]).toBe('admin.checklists.folders.open');
    act(() => { (document.querySelectorAll('[role="menu"] [role="menuitem"]')[0] as HTMLElement).click(); });
    expect(select).toHaveBeenCalledWith('f1');
  });

  it('offers "move" on an item row, for courses and for assignments', () => {
    for (const scope of ['course', 'assignment'] as const) {
      document.body.innerHTML = '';
      const { host } = mount([{ id: 'c1', title: 'Fire safety', folderId: null }], scope);
      rightClick(row(host, 'item:c1')!);
      expect(items()).toEqual(['admin.checklists.folders.moveOpen']);
    }
  });
});
