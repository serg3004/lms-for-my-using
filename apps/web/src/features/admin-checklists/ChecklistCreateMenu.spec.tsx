// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChecklistCreateMenu } from './ChecklistCreateMenu.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, 'requestAnimationFrame', { writable: true, value: (callback: () => void) => { callback(); return 0; } });
const t = ((_key: string, fallback?: string) => fallback ?? _key) as unknown as TFunction;

function mount(props: { canCreateFolder: boolean; onCreateFolder?: () => void; onCreateChecklist?: () => void }) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<ChecklistCreateMenu canCreateFolder={props.canCreateFolder} onCreateFolder={props.onCreateFolder ?? vi.fn()} onCreateChecklist={props.onCreateChecklist ?? vi.fn()} t={t} />));
  return host;
}
const trigger = (host: HTMLElement) => host.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
const items = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));

describe('ChecklistCreateMenu (PR 409)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('has a "+" button named "Create" that opens a menu of a folder and a checklist', () => {
    const host = mount({ canCreateFolder: true });
    expect(trigger(host).textContent).toBe('+Create');
    expect(trigger(host).getAttribute('aria-expanded')).toBe('false');
    expect(items(host)).toHaveLength(0);
    act(() => trigger(host).click());
    expect(trigger(host).getAttribute('aria-expanded')).toBe('true');
    expect(items(host).map((item) => item.textContent)).toEqual(['Folder…', 'Checklist']);
  });

  it('runs the chosen action and closes the menu', () => {
    const onCreateFolder = vi.fn();
    const onCreateChecklist = vi.fn();
    const host = mount({ canCreateFolder: true, onCreateFolder, onCreateChecklist });
    act(() => trigger(host).click());
    act(() => items(host)[0]!.click());
    expect(onCreateFolder).toHaveBeenCalledTimes(1);
    expect(items(host)).toHaveLength(0);
    act(() => trigger(host).click());
    act(() => items(host)[1]!.click());
    expect(onCreateChecklist).toHaveBeenCalledTimes(1);
  });

  it('moves with the arrow keys and closes on Escape', () => {
    const host = mount({ canCreateFolder: true });
    act(() => trigger(host).click());
    expect(document.activeElement).toBe(items(host)[0]);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(document.activeElement).toBe(items(host)[1]);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(items(host)).toHaveLength(0);
  });

  it('disables the folder item at the deepest level and explains why', () => {
    const onCreateFolder = vi.fn();
    const host = mount({ canCreateFolder: false, onCreateFolder });
    act(() => trigger(host).click());
    const folder = items(host)[0]!;
    expect(folder.disabled).toBe(true);
    const hint = host.querySelector('[role="note"]') as HTMLElement;
    expect(hint.textContent).toContain('5 levels');
    expect(folder.getAttribute('aria-describedby')).toBe(hint.id);
    act(() => folder.click());
    expect(onCreateFolder).not.toHaveBeenCalled();
  });
});
