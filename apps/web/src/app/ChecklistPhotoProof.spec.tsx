// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getBlob = vi.hoisted(() => vi.fn());
vi.mock('../shared/api/checklists.js', async () => {
  const actual = await vi.importActual<typeof import('../shared/api/checklists.js')>('../shared/api/checklists.js');
  return { ...actual, getChecklistItemPhotoBlob: getBlob };
});

import { ChecklistPhotoProof } from './ChecklistPhotoProof.js';

let root: ReturnType<typeof createRoot> | undefined;

async function render(canChange = true) {
  const onReplace = vi.fn();
  const onRemove = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const t = i18n.t.bind(i18n) as never;
  await act(async () => { root?.render(<ChecklistPhotoProof instanceId="i1" itemId="c1" fileName="shelf.jpg" canChange={canChange} onReplace={onReplace} onRemove={onRemove} t={t} />); });
  return { onReplace, onRemove };
}
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement | undefined;
const click = async (el: HTMLElement | undefined) => { await act(async () => { el?.click(); }); };

beforeEach(async () => {
  await i18n.changeLanguage('ru');
  getBlob.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
  // jsdom has no modal <dialog>
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
});

describe('ChecklistPhotoProof (PR 406а)', () => {
  it('shows the mark and file name, and does not fetch the picture until asked', async () => {
    await render();
    expect(document.body.textContent).toContain('Фото вложено');
    expect(document.body.textContent).toContain('shelf.jpg');
    expect(document.querySelector('img')).toBeNull();
    expect(getBlob).not.toHaveBeenCalled();
  });

  it('opens the picture in a dialog on demand', async () => {
    getBlob.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    await render();
    await click(button('Посмотреть фото'));
    expect(getBlob).toHaveBeenCalledWith('i1', 'c1');
    expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:photo');
    await click(button('Закрыть'));
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows an error and loads again on retry', async () => {
    getBlob.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(new Blob(['x']));
    await render();
    await click(button('Посмотреть фото'));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Не удалось показать фото');
    await click(button('Повторить'));
    expect(document.querySelector('img')).not.toBeNull();
    expect(getBlob).toHaveBeenCalledTimes(2);
  });

  it('offers replace and remove only while the sheet can change', async () => {
    const { onReplace, onRemove } = await render();
    await click(button('Заменить'));
    await click(button('Удалить'));
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
    await act(async () => { root?.unmount(); }); root = undefined; document.body.innerHTML = '';
    await render(false);
    expect(button('Заменить')).toBeUndefined();
    expect(button('Удалить')).toBeUndefined();
    expect(button('Посмотреть фото')).toBeDefined();
  });
});
