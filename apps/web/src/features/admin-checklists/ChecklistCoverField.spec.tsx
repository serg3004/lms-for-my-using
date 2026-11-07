// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';

const api = vi.hoisted(() => ({
  uploadChecklistCover: vi.fn(),
  deleteChecklistCover: vi.fn(),
  getChecklistCoverBlob: vi.fn(),
}));
vi.mock('../../shared/api/checklists.js', () => api);

import { ChecklistCoverField } from './ChecklistCoverField';

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render(coverUpdatedAt: string | null = null) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(<ChecklistCoverField checklistId="c1" title="Лист" coverUpdatedAt={coverUpdatedAt} />); });
}
const buttons = () => [...container.querySelectorAll('button')].map((b) => b.textContent);
async function pick(file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

beforeEach(async () => {
  // PR 400: pictures are shown through blob: URLs; jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => 'blob:cover');
  URL.revokeObjectURL = vi.fn();
  await i18n.changeLanguage('ru');
  api.getChecklistCoverBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ChecklistCoverField (PR 355)', () => {
  it('offers only upload while there is no picture and shows the default illustration', async () => {
    await render();
    expect(buttons()).toEqual(['Загрузить миниатюру']);
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
    expect(api.getChecklistCoverBlob).not.toHaveBeenCalled();
  });

  it('rejects a wrong type and an oversized file before any request', async () => {
    await render();
    await pick(new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('JPEG');
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 100 * 1024 * 1024 });
    await pick(big);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('МБ');
    expect(api.uploadChecklistCover).not.toHaveBeenCalled();
  });

  it('uploads a valid image, then offers replace and remove', async () => {
    api.uploadChecklistCover.mockResolvedValue({ id: 'c1', coverUpdatedAt: '2026-10-27T10:00:00.000Z' });
    await render();
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    await pick(file);
    expect(api.uploadChecklistCover).toHaveBeenCalledWith('c1', file);
    expect(buttons()).toEqual(['Заменить миниатюру', 'Удалить миниатюру']);
    expect(api.getChecklistCoverBlob).toHaveBeenCalledWith('c1');
  });

  it('removes the picture and returns to the default illustration', async () => {
    api.deleteChecklistCover.mockResolvedValue({ id: 'c1', coverUpdatedAt: null });
    await render('2026-10-27T10:00:00.000Z');
    const remove = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Удалить миниатюру');
    await act(async () => { remove?.click(); });
    expect(api.deleteChecklistCover).toHaveBeenCalledWith('c1');
    expect(buttons()).toEqual(['Загрузить миниатюру']);
    expect(container.querySelector('img')).toBeNull();
  });

  it('says that the upload timed out and uploads the same file again on "Повторить"', async () => {
    api.uploadChecklistCover.mockRejectedValueOnce(new ApiClientError('Request timed out', 408));
    await render();
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    await pick(file);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Изображение не загрузилось за отведённое время');
    api.uploadChecklistCover.mockResolvedValueOnce({ coverUpdatedAt: '2026-11-06T10:00:00Z' });
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Повторить')!;
    await act(async () => { retry.click(); });
    expect(api.uploadChecklistCover).toHaveBeenLastCalledWith('c1', file);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the server message when the upload is rejected and keeps the previous state', async () => {
    api.uploadChecklistCover.mockRejectedValue(new ApiClientError('File content does not match declared file type', 400));
    await render();
    await pick(new File(['x'], 'cover.png', { type: 'image/png' }));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('File content does not match declared file type');
    expect(buttons()).toEqual(['Загрузить миниатюру']);
  });

  // PR 400: a picture that cannot be shown says so in the editor and offers "Повторить".
  it('shows a message and a retry button when the picture cannot be loaded', async () => {
    api.getChecklistCoverBlob.mockRejectedValueOnce(new Error('offline'));
    await render('2026-10-27T10:00:00.000Z');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Не удалось показать миниатюру');
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Повторить');
    await act(async () => { retry?.click(); });
    expect(api.getChecklistCoverBlob).toHaveBeenCalledTimes(2);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:cover');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
