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
    expect(container.textContent).toContain('Изображений пока нет.');
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

  it('says in the interface language that the upload timed out and retries with the same file', async () => {
    await render([photo(1)]);
    api.uploadChecklistPhoto.mockRejectedValueOnce(new ApiClientError('Request timed out', 408));
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await pick(file);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Изображение не загрузилось за отведённое время');
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain('Request timed out');
    api.uploadChecklistPhoto.mockResolvedValueOnce(photo(2));
    await act(async () => { button('Повторить')!.click(); });
    expect(api.uploadChecklistPhoto).toHaveBeenLastCalledWith('c1', file);
    expect(captions()).toEqual(['Схема 1', 'Схема 2']);
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
    expect(button('Добавить изображение')?.disabled).toBe(true);
    expect(container.textContent).toContain('Загружено максимум изображений: 6.');
  });

  it('moves a photo with the arrows and saves the order; a failed save puts it back', async () => {
    await render([1, 2, 3].map(photo));
    expect(button('Изображение 1 выше')?.disabled).toBe(true);
    expect(button('Изображение 3 ниже')?.disabled).toBe(true);
    api.reorderChecklistPhotos.mockResolvedValueOnce([]);
    await act(async () => { button('Изображение 2 выше')!.click(); });
    expect(api.reorderChecklistPhotos).toHaveBeenCalledWith('c1', ['p2', 'p1', 'p3']);
    expect(captions()).toEqual(['Схема 2', 'Схема 1', 'Схема 3']);
    api.reorderChecklistPhotos.mockRejectedValueOnce(new ApiClientError('Нет связи', 500));
    await act(async () => { button('Изображение 3 выше')!.click(); });
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
    await act(async () => { button('Удалить изображение 1')!.click(); });
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
    expect(button('Добавить изображение')?.disabled).toBe(true);
    expect(button('Изображение 1 выше')).toBeUndefined();
    expect(container.querySelector<HTMLInputElement>('[role="textbox"]')?.getAttribute('contenteditable')).toBe('false');
  });
});

describe('"Show images on the checklist" box (PR 437)', () => {
  async function renderWithBox(showOnSheet: boolean, disabled = false) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const seen: boolean[] = [];
    await act(async () => { root?.render(<ChecklistPhotosField checklistId="c1" title="Лист" photos={[photo(1)]} disabled={disabled} showOnSheet={showOnSheet} onShowOnSheetChange={(value) => seen.push(value)} />); });
    return seen;
  }
  const box = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

  it('is ticked by default, reports a change and shows no hint while the images are shown', async () => {
    const seen = await renderWithBox(true);
    expect(box().checked).toBe(true);
    expect(box().closest('label')?.textContent).toBe('Показывать изображения на чек-листе');
    expect(container.textContent).not.toContain('Изображения не видны при заполнении листа.');
    await act(async () => { box().click(); });
    expect(seen).toEqual([false]);
  });

  it('explains that the images stay in the editor but are not shown when the box is off, and the editor stays usable', async () => {
    await renderWithBox(false);
    expect(box().checked).toBe(false);
    expect(container.textContent).toContain('Изображения не видны при заполнении листа.');
    expect(button('Добавить изображение')?.disabled).toBe(false);
    expect(button('Изображение 1 ниже')).toBeDefined();
  });

  it('cannot be changed without the right to edit, and there is no box where the parent does not offer it', async () => {
    await renderWithBox(true, true);
    expect(box().disabled).toBe(true);
    await act(async () => { root?.unmount(); });
    container.remove();
    await render([photo(1)]);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });
});

