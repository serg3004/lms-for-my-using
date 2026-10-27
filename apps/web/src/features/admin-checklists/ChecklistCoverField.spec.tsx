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
  getChecklistCoverUrl: vi.fn(),
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
  await i18n.changeLanguage('ru');
  api.getChecklistCoverUrl.mockResolvedValue({ url: 'https://storage.example.test/c.png', expiresIn: 300 });
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
    expect(buttons()).toEqual(['Загрузить картинку']);
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
    expect(api.getChecklistCoverUrl).not.toHaveBeenCalled();
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
    expect(buttons()).toEqual(['Заменить картинку', 'Удалить картинку']);
    expect(api.getChecklistCoverUrl).toHaveBeenCalledWith('c1');
  });

  it('removes the picture and returns to the default illustration', async () => {
    api.deleteChecklistCover.mockResolvedValue({ id: 'c1', coverUpdatedAt: null });
    await render('2026-10-27T10:00:00.000Z');
    const remove = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Удалить картинку');
    await act(async () => { remove?.click(); });
    expect(api.deleteChecklistCover).toHaveBeenCalledWith('c1');
    expect(buttons()).toEqual(['Загрузить картинку']);
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the server message when the upload is rejected and keeps the previous state', async () => {
    api.uploadChecklistCover.mockRejectedValue(new ApiClientError('File content does not match declared file type', 400));
    await render();
    await pick(new File(['x'], 'cover.png', { type: 'image/png' }));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('File content does not match declared file type');
    expect(buttons()).toEqual(['Загрузить картинку']);
  });
});
