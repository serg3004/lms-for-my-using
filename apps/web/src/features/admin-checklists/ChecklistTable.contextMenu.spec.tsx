// @vitest-environment jsdom
import '../../i18n/index.js';

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { TFunction } from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistFolder, ChecklistSummary } from '../../shared/api/types.js';
import { ChecklistTable } from './ChecklistTable.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, 'requestAnimationFrame', { writable: true, value: (callback: () => void) => { callback(); return 0; } });
Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
const tFill = ((key: string, fallback?: string | Record<string, unknown>, options?: Record<string, unknown>) => {
  const text = typeof fallback === 'string' ? fallback : key;
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? ''));
}) as unknown as TFunction;

const folder = (id: string, name: string, extra: Partial<ChecklistFolder> = {}): ChecklistFolder => ({
  id, parentId: null, name, visibleToStaff: true, createdBy: 'u', createdAt: '2026-10-01T10:00:00.000Z', canManage: true, checklistCount: 0, totalChecklistCount: 0, creator: null, ...extra,
});
const sheet = (id: string, title: string) => ({ id, title, status: 'draft', scoringMode: 'sum_points', items: [], createdAt: '2026-10-02T10:00:00.000Z', folderId: null, assignmentCount: 0 }) as unknown as ChecklistSummary;
const folders = [folder('a', 'Магазин'), folder('b', 'Склад')];
const sheets = [sheet('s1', 'Уборка'), sheet('s2', 'Открытие')];

const handlers = {
  onOpenFolder: vi.fn(), onRenameFolder: vi.fn(), onMoveFolder: vi.fn(), onDeleteFolder: vi.fn(), onMoveSelection: vi.fn(), onDeleteSelection: vi.fn(),
  onCreateFolder: vi.fn(), onCreateChecklist: vi.fn(), onEdit: vi.fn(), onCopy: vi.fn(), onDelete: vi.fn(), onMove: vi.fn(), onStatusChange: vi.fn(),
};

function Harness({ initial = [] as string[], canCreateFolder = true }: { initial?: string[]; canCreateFolder?: boolean }) {
  const [selected, setSelected] = useState(() => new Set(initial));
  return <ChecklistTable childFolders={folders} allSheets={sheets} folders={folders} rows={sheets} selectedKeys={selected} onSelectionChange={setSelected} canCreateFolder={canCreateFolder}
    scoringModeLabels={{ sum_points: 'Sum', all_required: 'All', scale: 'Scale' }} statusLabels={{ draft: 'Draft', published: 'Published', archived: 'Archived' }} t={tFill} {...handlers} />;
}

let host: HTMLElement;
function mount(props: Parameters<typeof Harness>[0] = {}) {
  host = document.createElement('div');
  document.body.append(host);
  act(() => createRoot(host).render(<Harness {...props} />));
}
const row = (key: string) => host.querySelector<HTMLElement>(`tr[data-row-key="${key}"]`)!;
const menuItems = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')).map((item) => item.textContent);
const menu = () => document.querySelector<HTMLElement>('[role="menu"][aria-label]');
const checkedBoxes = () => Array.from(host.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')).filter((box) => box.checked).length;
function rightClick(element: Element, x = 40, y = 60) {
  act(() => { element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })); });
}
function press(element: Element, key: string, init: KeyboardEventInit = {}) {
  act(() => { element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })); });
}

describe('ChecklistTable context menu (PR 411)', () => {
  beforeEach(() => { Object.values(handlers).forEach((fn) => fn.mockClear()); });
  afterEach(() => { document.body.innerHTML = ''; });

  it('opens the folder menu on a right click, selects the row and keeps the browser menu away', () => {
    mount();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 });
    act(() => { row('folder:a').dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(menu()?.getAttribute('aria-label')).toBe('Actions: Магазин');
    expect(menuItems()).toEqual(['Open', 'Rename folder', 'Move to folder…', 'Delete']);
    expect(checkedBoxes()).toBe(1);
  });

  it('renames the folder from the menu and closes the menu', () => {
    mount();
    rightClick(row('folder:a'));
    act(() => document.querySelector<HTMLElement>('[role="menuitem"]:nth-child(2)')!.click());
    expect(handlers.onRenameFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(menu()).toBeNull();
  });

  it('shows the same actions for a checklist as the row menu', () => {
    mount();
    rightClick(row('s1'));
    expect(menuItems()).toEqual(['Edit', 'Copy', 'Archive', 'Move to folder…', 'Delete']);
  });

  it('acts on the whole selection when the click lands on a selected row, and drops Open and Rename', () => {
    mount({ initial: ['folder:a', 's1'] });
    rightClick(row('s1'));
    expect(menu()?.getAttribute('aria-label')).toBe('Actions on the selection (2)');
    expect(menuItems()).toEqual(['Move the selection to a folder…', 'Delete the selection…']);
    act(() => document.querySelector<HTMLElement>('[role="menuitem"]:nth-child(1)')!.click());
    expect(handlers.onMoveSelection).toHaveBeenCalledWith({ sheets: [expect.objectContaining({ id: 's1' })], folders: [expect.objectContaining({ id: 'a' })] });
  });

  it('moves the selection to a row that was outside it', () => {
    mount({ initial: ['folder:a', 's1'] });
    rightClick(row('s2'));
    expect(checkedBoxes()).toBe(1);
    expect(menu()?.getAttribute('aria-label')).toBe('Actions: Открытие');
  });

  it('offers to create a folder or a checklist on the empty area, and disables the folder at the deepest level', () => {
    mount({ canCreateFolder: false });
    rightClick(host.firstElementChild!);
    expect(menu()?.getAttribute('aria-label')).toBe('Library actions');
    expect(menuItems()).toEqual(['Folder…', 'Checklist']);
    expect(document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.disabled).toBe(true);
    act(() => document.querySelectorAll<HTMLElement>('[role="menuitem"]')[1]!.click());
    expect(handlers.onCreateChecklist).toHaveBeenCalledOnce();
  });

  it('opens from the keyboard with Shift+F10 and the menu key, moves with the arrows and closes on Escape returning focus to the row', () => {
    mount();
    const target = row('folder:b');
    act(() => target.focus());
    press(target, 'F10', { shiftKey: true });
    expect(menu()).not.toBeNull();
    expect(document.activeElement?.textContent).toBe('Open');
    press(document.activeElement!, 'ArrowDown');
    expect(document.activeElement?.textContent).toBe('Rename folder');
    press(document.activeElement!, 'Escape');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(target);
    press(target, 'ContextMenu');
    expect(menu()).not.toBeNull();
  });

  it('F2 renames the focused folder and Delete asks to delete the focused row or the selection', () => {
    mount();
    const target = row('folder:a');
    press(target, 'F2');
    expect(handlers.onRenameFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    press(target, 'Delete');
    expect(handlers.onDeleteFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    press(row('s1'), 'F2');
    expect(handlers.onRenameFolder).toHaveBeenCalledOnce();
    press(row('s1'), 'Delete');
    expect(handlers.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('Delete on a selected row of several deletes the whole selection; keys typed in a button are ignored', () => {
    mount({ initial: ['folder:a', 's1'] });
    press(row('s1'), 'Delete');
    expect(handlers.onDeleteSelection).toHaveBeenCalledOnce();
    press(host.querySelector('tr[data-row-key="s2"] button')!, 'Delete');
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it('opens after a long press on a touch screen and not after a short tap', () => {
    vi.useFakeTimers();
    try {
      mount();
      const target = row('s1');
      const down = (x: number) => act(() => { target.dispatchEvent(Object.assign(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: 10 }), { pointerType: 'touch' })); });
      down(10);
      act(() => { target.dispatchEvent(Object.assign(new MouseEvent('pointerup', { bubbles: true }), { pointerType: 'touch' })); vi.advanceTimersByTime(600); });
      expect(menu()).toBeNull();
      down(10);
      act(() => { vi.advanceTimersByTime(600); });
      expect(menu()).not.toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('keeps the menu inside the screen: it opens to the left and upwards near the right and bottom edges', () => {
    mount();
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 150 });
    try {
      rightClick(row('s1'), window.innerWidth - 10, window.innerHeight - 10);
      const style = menu()!.style;
      expect(Number.parseFloat(style.left)).toBe(window.innerWidth - 10 - 200);
      expect(Number.parseFloat(style.top)).toBe(window.innerHeight - 10 - 150);
    } finally {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
    }
  });
});
