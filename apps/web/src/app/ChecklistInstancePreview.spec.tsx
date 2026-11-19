// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getChecklistInstanceReport: vi.fn(),
  downloadChecklistInstanceReportPdf: vi.fn(),
  listChecklistTransferHistory: vi.fn(async () => []),
  getChecklistItemPhotoBlob: vi.fn(),
}));
vi.mock('../shared/api/checklists.js', () => api);

import { ApiClientError } from '../shared/apiClient.js';
import { ChecklistInstancePreview } from './ChecklistInstancePreview.js';

let root: ReturnType<typeof createRoot> | undefined;
const t = () => i18n.t.bind(i18n) as never;
const text = () => document.body.textContent ?? '';
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement | undefined;
const person = { id: 'u1', firstName: 'Анна', lastName: 'Иванова', email: 'a@example.test', department: { id: 'd', name: 'Смена А' } };

const report = (patch: Record<string, unknown> = {}) => ({
  pointsVisible: true, sessionId: null, instanceId: 'inst-1', checklist: { id: 'c1', title: 'Приёмка товара', showNumbering: true }, visible: true,
  header: { status: 'in_progress', timezone: 'Asia/Almaty', scheduledStart: null, scheduledEnd: null, startedAt: '2026-11-19T04:00:00.000Z', completedAt: null, learner: person, observer: null },
  generalInfo: [], summary: null, groups: [],
  criteria: [{ id: 'i1', number: '1', groupId: null, text: 'Пломба цела', state: 'answered', score: null, maxScore: null, levelLabel: 'Да', comment: 'Проверено', photo: null, reviewStatus: null, color: null }],
  feedback: null, feedbackForm: null, location: { policy: 'off', captures: [] }, transfers: [], ...patch,
});

async function render(onBack = vi.fn()) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(<ChecklistInstancePreview instanceId="inst-1" onBack={onBack} t={t()} />); });
  await act(async () => { await Promise.resolve(); });
  return onBack;
}

beforeEach(async () => { await i18n.changeLanguage('ru'); });
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ChecklistInstancePreview (PR 478)', () => {
  it('shows the answers and a note instead of points before the check is completed, without observer or schedule', async () => {
    api.getChecklistInstanceReport.mockResolvedValue(report());
    await render();
    expect(text()).toContain('Приёмка товара');
    expect(text()).toContain('Пломба цела');
    expect(text()).toContain('Проверено');
    expect(text()).toContain('Проверка ещё не завершена');
    expect(text()).not.toContain('Наблюдатель');
    expect(text()).not.toContain('Плановый период');
    expect(text()).toContain('Анна Иванова');
  });

  it('shows the result after completion', async () => {
    api.getChecklistInstanceReport.mockResolvedValue(report({
      header: { ...report().header, status: 'completed', completedAt: '2026-11-19T05:00:00.000Z' },
      summary: { scored: true, scoringMode: 'sum_points', percentage: 80, totalScore: 8, maxScore: 10, criteriaCount: 1, answeredCount: 1, skippedCount: 0, passed: true, passThreshold: 70, formula: 'snapshot', color: null },
    }));
    await render();
    expect(text()).toContain('80%');
    expect(text()).toContain('Зачёт');
    expect(text()).not.toContain('Проверка ещё не завершена');
  });

  it('says there are no answers yet', async () => {
    api.getChecklistInstanceReport.mockResolvedValue(report({ criteria: [] }));
    await render();
    expect(text()).toContain('Ответов пока нет.');
  });

  it('shows an error when the report cannot be loaded and still offers the way back', async () => {
    api.getChecklistInstanceReport.mockRejectedValue(new ApiClientError('nope', 404));
    const onBack = await render();
    expect(document.querySelector('[role="alert"]') ?? document.body).toBeTruthy();
    await act(async () => { button('← Назад к проверке')?.click(); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('downloads the PDF and reports a failure', async () => {
    api.getChecklistInstanceReport.mockResolvedValue(report());
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    api.downloadChecklistInstanceReportPdf.mockResolvedValueOnce({ blob: new Blob(['%PDF-']), filename: 'checklist-inst-1.pdf' });
    await render();
    await act(async () => { button('Скачать PDF')?.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(api.downloadChecklistInstanceReportPdf).toHaveBeenCalledWith('inst-1');
    api.downloadChecklistInstanceReportPdf.mockRejectedValueOnce(new ApiClientError('Слишком большой', 413));
    await act(async () => { button('Скачать PDF')?.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(text()).toContain('Слишком большой');
  });

  it('prints the page', async () => {
    api.getChecklistInstanceReport.mockResolvedValue(report());
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await render();
    await act(async () => { button('Печать')?.click(); });
    expect(print).toHaveBeenCalledTimes(1);
  });
});
