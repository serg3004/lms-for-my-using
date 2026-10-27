// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const upload = vi.hoisted(() => vi.fn());
vi.mock('../shared/apiClient.js', async () => {
  const actual = await vi.importActual<typeof import('../shared/apiClient.js')>('../shared/apiClient.js');
  return { ...actual, uploadChecklistItemPhotoWithProgress: upload };
});

import { ConductScreen } from './ChecklistSessionConduct.js';

const item = { id: 'item-1', checklistId: 'c1', order: 1, text: 'Check the till float', points: 10, isRequired: true, photoRequired: true, weight: 1, allowSkip: false, autoSkipUnanswered: false, scaleId: null, groupId: null, scale: null };
const data = (forbidGalleryPhotos: boolean) => ({
  session: { id: 's1', status: 'in_progress', version: 1, locationCapturePolicy: 'off', timezone: 'UTC', strengths: null, developmentAreas: null, nextSteps: null, startedAt: '2026-02-01T09:05:00.000Z', scheduledAt: null, checklist: { id: 'c1', title: 'Opening' }, learner: { id: 'l1', firstName: 'Leo', lastName: 'L', email: 'l@example.invalid' }, observer: { id: 'o1', firstName: 'Olga', lastName: 'O', email: 'o@example.invalid' }, result: null },
  instance: { id: 'i1', status: 'in_progress', checklist: { id: 'c1', title: 'Opening', description: null, scoringMode: 'sum_points', scaleLevels: null, requiresReview: false, forbidGalleryPhotos, allowFinishIncomplete: false, contextFields: [], itemGroups: [], items: [item] }, results: [{ id: 'r1', itemId: 'item-1', checked: true, scaleLevel: null, points: 10, photoUrl: null, photoFileName: null, comment: null, answerState: 'answered' }] },
}) as never;

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  upload.mockReset();
});

async function render(forbidGalleryPhotos = false) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const t = i18n.t.bind(i18n) as never;
  await act(async () => { root?.render(<ConductScreen data={data(forbidGalleryPhotos)} onBack={vi.fn()} onReload={vi.fn()} onMutate={vi.fn()} t={t} />); });
  return host;
}
async function choose(host: HTMLElement, file: File) {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

describe('conduct photo attachment limits (PR 348)', () => {
  it('shows the limit hint, and the camera-only explanation only when gallery photos are forbidden', async () => {
    await i18n.changeLanguage('ru');
    const normal = await render(false);
    expect(normal.textContent).toContain('не больше 8 МБ');
    expect(normal.textContent).not.toContain('не серверная проверка');
    expect(normal.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('image/jpeg,image/png,image/gif,image/webp');
    await act(async () => { root?.unmount(); }); root = undefined; document.body.innerHTML = '';
    const cameraOnly = await render(true);
    expect(cameraOnly.textContent).toContain('а не серверная проверка');
    expect(cameraOnly.querySelector('input[type="file"]')?.getAttribute('capture')).toBe('environment');
  });

  it('blocks an oversized or non-image file before any request and shows the reason', async () => {
    await i18n.changeLanguage('ru');
    const host = await render();
    await choose(host, new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }));
    expect(upload).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Файл больше 8 МБ');
    await choose(host, new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }));
    expect(upload).not.toHaveBeenCalled();
    expect(host.textContent).toContain('JPEG, PNG, GIF или WEBP');
  });

  it('sends a valid photo', async () => {
    await i18n.changeLanguage('en');
    upload.mockResolvedValue({ id: 'i1', status: 'in_progress', results: [] });
    const host = await render();
    await choose(host, new File(['x'], 'ok.jpg', { type: 'image/jpeg' }));
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
