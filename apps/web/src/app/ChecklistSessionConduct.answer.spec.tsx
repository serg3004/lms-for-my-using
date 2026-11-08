// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ clearChecklistItemAnswer: vi.fn(), submitChecklistItemResult: vi.fn() }));
vi.mock('../shared/api/checklists.js', async () => {
  const actual = await vi.importActual<typeof import('../shared/api/checklists.js')>('../shared/api/checklists.js');
  return { ...actual, clearChecklistItemAnswer: api.clearChecklistItemAnswer, submitChecklistItemResult: api.submitChecklistItemResult };
});

import { ConductScreen } from './ChecklistSessionConduct.js';

const scale = { id: 'sc', name: 'S', levels: [{ value: 1, label: 'Плохо', score: 0, color: '#C62828' }, { value: 2, label: 'Средне', score: 5, color: '#1565C0' }, { value: 3, label: 'Отлично', score: 10, color: '#2E7D32' }] };
const item = { id: 'item-1', checklistId: 'c1', order: 1, text: 'Касса', points: 10, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false, scaleId: 'sc', groupId: null, scale };
const instance = (results: unknown[], status = 'in_progress') => ({ id: 'i1', status, checklist: { id: 'c1', title: 'Opening', description: null, scoringMode: 'sum_points', scaleLevels: null, requiresReview: false, forbidGalleryPhotos: false, allowFinishIncomplete: false, contextFields: [], itemGroups: [], items: [item] }, results });
const result = (patch: Record<string, unknown> = {}) => ({ id: 'r1', itemId: 'item-1', checked: false, scaleLevel: 2, points: 5, photoUrl: null, photoFileName: null, comment: null, answerState: 'answered', ...patch });
const data = (results: unknown[]) => ({
  session: { id: 's1', status: 'in_progress', version: 1, locationCapturePolicy: 'off', timezone: 'UTC', strengths: null, developmentAreas: null, nextSteps: null, startedAt: '2026-02-01T09:05:00.000Z', scheduledAt: null, checklist: { id: 'c1', title: 'Opening' }, learner: { id: 'l1', firstName: 'Leo', lastName: 'L', email: 'l@example.invalid' }, observer: { id: 'o1', firstName: 'Olga', lastName: 'O', email: 'o@example.invalid' }, result: null },
  instance: instance(results),
}) as never;

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  api.clearChecklistItemAnswer.mockReset();
  api.submitChecklistItemResult.mockReset();
});

async function render(results: unknown[]) {
  await i18n.changeLanguage('ru');
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const t = i18n.t.bind(i18n) as never;
  await act(async () => { root?.render(<ConductScreen data={data(results)} onBack={vi.fn()} onReload={vi.fn()} onMutate={vi.fn()} t={t} />); });
  return host;
}
const level = (host: HTMLElement, label: string) => [...host.querySelectorAll('label')].find((l) => l.textContent?.includes(label)) as HTMLLabelElement;
const radio = (host: HTMLElement, label: string) => level(host, label).querySelector('input') as HTMLInputElement;
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

describe('conduct answer: level colour and taking an answer back (PR 425)', () => {
  it('paints only the chosen level, with its own colour, a tick and a thick border', async () => {
    const host = await render([result()]);
    expect(level(host, 'Средне').style.borderColor).toBe(rgb('#1565C0'));
    expect(level(host, 'Средне').style.borderWidth).toBe('2px');
    expect(level(host, 'Средне').textContent).toContain('✓');
    expect(level(host, 'Отлично').style.borderColor).not.toBe(rgb('#2E7D32'));
    expect(level(host, 'Отлично').textContent).not.toContain('✓');
    expect(level(host, 'Средне').style.minHeight).toBe('44px');
    expect(radio(host, 'Средне').checked).toBe(true);
    expect(radio(host, 'Отлично').checked).toBe(false);
  });

  it('takes the answer back with a second click on the chosen level, without choosing anything', async () => {
    api.clearChecklistItemAnswer.mockResolvedValue(instance([]));
    const host = await render([result()]);
    await act(async () => { radio(host, 'Средне').click(); });
    expect(api.clearChecklistItemAnswer).toHaveBeenCalledWith('i1', 'item-1');
    expect(api.submitChecklistItemResult).not.toHaveBeenCalled();
  });

  it('takes the answer back with the "Clear answer" button, which exists only while there is an answer', async () => {
    api.clearChecklistItemAnswer.mockResolvedValue(instance([]));
    const host = await render([result()]);
    const clear = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Снять ответ') as HTMLButtonElement;
    expect(clear).toBeTruthy();
    await act(async () => { clear.click(); });
    expect(api.clearChecklistItemAnswer).toHaveBeenCalledWith('i1', 'item-1');
    await act(async () => { root?.unmount(); }); root = undefined; document.body.innerHTML = '';
    const empty = await render([]);
    expect([...empty.querySelectorAll('button')].some((b) => b.textContent === 'Снять ответ')).toBe(false);
  });

  it('chooses another level normally (no clear call)', async () => {
    api.submitChecklistItemResult.mockResolvedValue(instance([result({ scaleLevel: 3, points: 10 })]));
    const host = await render([result()]);
    await act(async () => { radio(host, 'Отлично').click(); });
    expect(api.submitChecklistItemResult).toHaveBeenCalledWith('i1', 'item-1', { scaleLevel: 3 });
    expect(api.clearChecklistItemAnswer).not.toHaveBeenCalled();
  });
});
