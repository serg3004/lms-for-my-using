// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

import type { ChecklistPhotoSummary } from './api/types.js';

const api = vi.hoisted(() => ({ getChecklistPhotoBlob: vi.fn() }));
vi.mock('./api/checklists.js', () => api);

import { ChecklistPhotoStrip } from './ChecklistPhotoStrip';

const photos: ChecklistPhotoSummary[] = [
  { id: 'b', caption: 'Вторая', order: 1, updatedAt: '2026-11-05T00:00:00.000Z' },
  { id: 'a', caption: 'Первая', order: 0, updatedAt: '2026-11-05T00:00:00.000Z' },
];
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render(list: ChecklistPhotoSummary[], collapsible = false) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(<ChecklistPhotoStrip checklistId="c1" photos={list} title="Лист" collapsible={collapsible} />); });
}

beforeEach(async () => {
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };
  await i18n.changeLanguage('ru');
  api.getChecklistPhotoBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ChecklistPhotoStrip (PR 421)', () => {
  it('renders nothing without photos', async () => {
    await render([]);
    expect(container.innerHTML).toBe('');
    expect(api.getChecklistPhotoBlob).not.toHaveBeenCalled();
  });

  it('shows the photos in order with captions and the alt text from the caption', async () => {
    await render(photos);
    expect(container.querySelector('h3')?.textContent).toBe('Изображение на бланке чек-листа');
    const images = [...container.querySelectorAll('ul img')] as HTMLImageElement[];
    expect(images.map((image) => image.alt)).toEqual(['Изображение 1 листа «Лист»: Первая', 'Изображение 2 листа «Лист»: Вторая']);
    expect([...container.querySelectorAll('li p')].map((p) => p.textContent)).toEqual(['Первая', 'Вторая']);
    expect(api.getChecklistPhotoBlob).toHaveBeenCalledWith('c1', 'a');
  });

  it('opens a photo large with its caption and closes it', async () => {
    await render(photos);
    const open = container.querySelector('button[aria-label="Открыть изображение 2 крупно"]') as HTMLButtonElement;
    await act(async () => { open.click(); });
    const dialog = container.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('h2')?.textContent).toBe('Вторая');
    expect(dialog.querySelector('img')?.alt).toBe('Изображение 2 листа «Лист»: Вторая');
    const close = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Закрыть')!;
    await act(async () => { close.click(); });
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('can fold into a details block that counts the photos', async () => {
    await render(photos, true);
    expect(container.querySelector('details summary')?.textContent).toBe('Изображение на бланке чек-листа (2)');
    expect(container.querySelector('h3')).toBeNull();
  });

  it('offers "Retry" when a picture cannot be loaded', async () => {
    api.getChecklistPhotoBlob.mockRejectedValueOnce(new Error('network'));
    await render([photos[1]!]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Не удалось показать изображение.');
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Повторить')!;
    await act(async () => { retry.click(); });
    expect(container.querySelector('ul img')).not.toBeNull();
  });
});
