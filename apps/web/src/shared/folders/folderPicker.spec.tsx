// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';

import { FolderCreateMenu } from './FolderCreateMenu';
import { FolderDialog } from './FolderDialogs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;
afterEach(() => { container?.remove(); container = undefined; });
// jsdom has no <dialog> modal API.
HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
const t = ((key: string, fallback?: unknown) => typeof fallback === 'string' ? fallback : key) as unknown as TFunction;

async function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container!).render(node); });
  return container;
}

describe('one "+ Create" menu for every folder library', () => {
  it('offers a folder and the library item, and blocks the folder at the deepest level', async () => {
    const onFolder = vi.fn(), onItem = vi.fn();
    const root = await render(<FolderCreateMenu canCreateFolder={false} itemLabel="Assessment" onCreateFolder={onFolder} onCreateItem={onItem} t={t} />);
    await act(async () => { root.querySelector('button')!.click(); });
    const items = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items.map((item) => item.textContent)).toEqual(['Folder…', 'Assessment']);
    expect(items[0]!.disabled).toBe(true);
    expect(root.querySelector('[role="note"]')).not.toBeNull();
    await act(async () => { items[1]!.click(); });
    expect(onItem).toHaveBeenCalledTimes(1);
    expect(onFolder).not.toHaveBeenCalled();
  });
});

describe('folder dialog: colour', () => {
  it('shows the current colour of an edited folder and saves a changed one', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const folder = { id: 'f1', name: 'Safety', parentId: null, color: 'green' as const };
    await render(<FolderDialog colors onClose={() => undefined} onSubmit={onSubmit} t={t} target={{ kind: 'edit', folder }} />);
    const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios).toHaveLength(6);
    expect(radios.filter((radio) => radio.checked)).toHaveLength(1);
    await act(async () => { radios[2]!.click(); });
    await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Safety', color: 'blue' }));
  });
});
