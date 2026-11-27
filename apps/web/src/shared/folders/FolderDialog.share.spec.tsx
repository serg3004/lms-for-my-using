// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';

import { FolderDialog } from './FolderDialogs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;
afterEach(() => { container?.remove(); container = undefined; vi.useRealTimers(); });
HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
const t = ((key: string, fallback?: unknown, options?: Record<string, unknown>) => typeof fallback === 'string' ? fallback.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options?.[name] ?? '')) : key) as unknown as TFunction;

const folder = { id: 'f1', parentId: null, name: 'Shop', visibleToStaff: false, color: 'green' as const, canManage: true, sharedUsers: [{ id: 'u1', name: 'Ivanov Ivan' }] };

async function open(onSubmit = vi.fn().mockResolvedValue(undefined), shareSearch = vi.fn().mockResolvedValue([{ id: 'u2', name: 'Petrov Petr' }, { id: 'u1', name: 'Ivanov Ivan' }]), extra: { colorChoice?: boolean; colors?: boolean; access?: boolean; roleOptions?: string[]; folder?: typeof folder } = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container!).render(<FolderDialog colorChoice={extra.colors ? false : true} colors={extra.colors} access={extra.access} roleOptions={extra.roleOptions} onClose={() => undefined} onSubmit={onSubmit} shareSearch={shareSearch} t={t} target={{ kind: 'edit', folder: extra.folder ?? folder }} />); });
  return { onSubmit, shareSearch };
}

describe('folder settings of a checklist: colour and named employees (PR 515)', () => {
  it('shows the current colour and the employees the folder is opened to, next to the staff flag', async () => {
    await open();
    const dialog = document.querySelector('dialog')!;
    expect(dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')).not.toBeNull();
    const radios = Array.from(dialog.querySelectorAll<HTMLInputElement>('.folder-colors input[type="radio"]'));
    expect(radios).toHaveLength(6);
    expect(radios.findIndex((radio) => radio.checked)).toBe(1);
    expect(dialog.textContent).toContain('Ivanov Ivan');
  });

  it('adds a found employee once, removes one, and saves the new colour with the list', async () => {
    vi.useFakeTimers();
    const { onSubmit, shareSearch } = await open();
    const dialog = document.querySelector('dialog')!;
    const search = dialog.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(search, 'Pet');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(shareSearch).toHaveBeenCalledWith('Pet');
    const add = Array.from(dialog.querySelectorAll<HTMLButtonElement>('.folder-share__found button'));
    expect(add.map((button) => button.textContent)).toEqual(['Add: Petrov Petr']);
    await act(async () => { add[0]!.click(); });
    expect(dialog.querySelectorAll('.folder-share__chosen li')).toHaveLength(2);
    await act(async () => { dialog.querySelector<HTMLButtonElement>('button[aria-label="Remove: Ivanov Ivan"]')!.click(); });
    await act(async () => { dialog.querySelectorAll<HTMLInputElement>('.folder-colors input')[3]!.click(); });
    await act(async () => { dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Shop', visibleToStaff: false, accessRoles: [], color: 'orange', sharedUsers: [{ id: 'u2', name: 'Petrov Petr' }] });
  });

  it('offers the staff flag, roles and named employees in a section with colours only (tests, courses, materials), and saves the chosen roles', async () => {
    const { onSubmit } = await open(undefined, undefined, { colors: true, access: true, roleOptions: ['manager', 'instructor'], folder: { ...folder, accessRoles: ['instructor'] } as typeof folder });
    const dialog = document.querySelector('dialog')!;
    const boxes = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    // the staff flag, then one box per role; "instructor" is already ticked
    expect(boxes).toHaveLength(3);
    expect(boxes.map((box) => box.checked)).toEqual([false, false, true]);
    expect(dialog.querySelector('input[type="search"]')).not.toBeNull();
    await act(async () => { boxes[1]!.click(); });
    await act(async () => { dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ visibleToStaff: false, accessRoles: ['instructor', 'manager'] }));
  });

  it('hides the roles and sends none when the folder is open to all employees', async () => {
    const { onSubmit } = await open(undefined, undefined, { colors: true, access: true, roleOptions: ['instructor'], folder: { ...folder, visibleToStaff: true, accessRoles: ['instructor'] } as typeof folder });
    const dialog = document.querySelector('dialog')!;
    expect(dialog.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    await act(async () => { dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ visibleToStaff: true, accessRoles: [] }));
  });
});
