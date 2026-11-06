import { setRichText } from '../../shared/richTextTest.js';
// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import type { ChecklistPhotoSummary } from '../../shared/api/types.js';

const api = vi.hoisted(() => ({
  uploadChecklistPhoto: vi.fn(),
  updateChecklistPhotoCaption: vi.fn(),
  reorderChecklistPhotos: vi.fn(),
  deleteChecklistPhoto: vi.fn(),
  getChecklistPhotoBlob: vi.fn(),
}));
vi.mock('../../shared/api/checklists.js', () => api);

import { ChecklistPhotosField } from './ChecklistPhotosField';

const photo = (n: number): ChecklistPhotoSummary => ({ id: `p${n}`, caption: `Схема ${n}`, order: n - 1, updatedAt: '2026-11-05T00:00:00.000Z' });
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
let changes: ChecklistPhotoSummary[][];
async function render(photos: ChecklistPhotoSummary[] = [], disabled = false) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  changes = [];
  await act(async () => { root?.render(<ChecklistPhotosField checklistId="c1" title="Лист" photos={photos} disabled={disabled} onChange={(next) => changes.push(next)} />); });
}
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent === label) as HTMLButtonElement | undefined;
const captions = () => [...container.querySelectorAll<HTMLInputElement>('[role="textbox"]')].map((input) => input.textContent);
async function pick(file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
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

describe('ChecklistPhotosField (PR 421)', () => {
  it('shows an empty state and the counter, and loads no picture', async () => {
    await render();
    expect(container.textContent).toContain('Фото пока нет.');
    expect(container.textContent).toContain('(0/6)');
    expect(api.getChecklistPhotoBlob).not.toHaveBeenCalled();
  });

  it('rejects a wrong type before any request, then uploads a valid photo and reports the new list', async () => {
    await render([photo(1)]);
    await pick(new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('JPEG');
    expect(api.uploadChecklistPhoto).not.toHaveBeenCalled();
    api.uploadChecklistPhoto.mockResolvedValue(photo(2));
    await pick(new File(['x'], 'a.png', { type: 'image/png' }));
    expect(api.uploadChecklistPhoto).toHaveBeenCalledTimes(1);
    expect(captions()).toEqual(['Схема 1', 'Схема 2']);
    expect(changes.at(-1)?.map((entry) => entry.id)).toEqual(['p1', 'p2']);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the server message when the upload fails and keeps the list', async () => {
    await render([photo(1)]);
    api.uploadChecklistPhoto.mockRejectedValue(new ApiClientError('Лимит исчерпан', 409));
    await pick(new File(['x'], 'a.png', { type: 'image/png' }));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Лимит исчерпан');
    expect(captions()).toEqual(['Схема 1']);
  });

  it('stops offering "Add photo" at six photos', async () => {
    await render([1, 2, 3, 4, 5, 6].map(photo));
    expect(button('Добавить фото')?.disabled).toBe(true);
    expect(container.textContent).toContain('Загружено максимум фото: 6.');
  });

  it('moves a photo with the arrows and saves the order; a failed save puts it back', async () => {
    await render([1, 2, 3].map(photo));
    expect(button('Фото 1 выше')?.disabled).toBe(true);
    expect(button('Фото 3 ниже')?.disabled).toBe(true);
    api.reorderChecklistPhotos.mockResolvedValueOnce([]);
    await act(async () => { button('Фото 2 выше')!.click(); });
    expect(api.reorderChecklistPhotos).toHaveBeenCalledWith('c1', ['p2', 'p1', 'p3']);
    expect(captions()).toEqual(['Схема 2', 'Схема 1', 'Схема 3']);
    api.reorderChecklistPhotos.mockRejectedValueOnce(new ApiClientError('Нет связи', 500));
    await act(async () => { button('Фото 3 выше')!.click(); });
    expect(captions()).toEqual(['Схема 2', 'Схема 1', 'Схема 3']);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Нет связи');
  });

  it('saves a changed caption on blur and nothing when it is unchanged', async () => {
    await render([photo(1)]);
    const input = container.querySelector<HTMLInputElement>('[role="textbox"]')!;
    await act(async () => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(api.updateChecklistPhotoCaption).not.toHaveBeenCalled();
    api.updateChecklistPhotoCaption.mockResolvedValue({ ...photo(1), caption: 'Новая подпись' });

    await act(async () => { setRichText(input, ' Новая подпись '); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(api.updateChecklistPhotoCaption).toHaveBeenCalledWith('c1', 'p1', 'Новая подпись');
    expect(captions()).toEqual(['Новая подпись']);
  });

  it('removes only after the confirmation', async () => {
    await render([1, 2].map(photo));
    await act(async () => { button('Удалить фото 1')!.click(); });
    expect(api.deleteChecklistPhoto).not.toHaveBeenCalled();
    api.deleteChecklistPhoto.mockResolvedValue(undefined);
    const confirm = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Удалить')!;
    await act(async () => { confirm.click(); });
    expect(api.deleteChecklistPhoto).toHaveBeenCalledWith('c1', 'p1');
    expect(captions()).toEqual(['Схема 2']);
    expect(changes.at(-1)?.[0]).toMatchObject({ id: 'p2', order: 0 });
  });

  it('is read-only when the sheet cannot be edited', async () => {
    await render([photo(1)], true);
    expect(button('Добавить фото')?.disabled).toBe(true);
    expect(button('Фото 1 выше')).toBeUndefined();
    expect(container.querySelector<HTMLInputElement>('[role="textbox"]')?.getAttribute('contenteditable')).toBe('false');
  });
});
