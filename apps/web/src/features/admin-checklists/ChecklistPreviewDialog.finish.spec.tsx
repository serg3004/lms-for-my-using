// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

import type { ChecklistItemSummary } from '../../shared/api/types.js';
import { ChecklistPreviewDialog } from './ChecklistPreviewDialog';
import { previewUnfinishedItems } from './domain';

vi.mock('../../shared/api/checklists.js', () => ({ listChecklistAnswerSets: vi.fn().mockResolvedValue([]) }));

const t = i18n.t.bind(i18n);
const item = (n: number, patch: Partial<ChecklistItemSummary> = {}) => ({ id: `i${n}`, checklistId: 'c', order: n, text: `Критерий ${n}`, groupId: null, points: 2, weight: 1, isRequired: true, photoRequired: false, allowSkip: false, scale: null, ...patch }) as unknown as ChecklistItemSummary;
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
const noop = vi.fn();
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
});
afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); });
async function render(scoringMode: 'sum_points' | 'none' = 'sum_points', items = [item(1), item(2)], extra: Record<string, unknown> = {}) {
  await i18n.changeLanguage('ru');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<ChecklistPreviewDialog title="Лист" description="" items={items} groups={[]} contextFields={[]} scoringMode={scoringMode} scaleLevels={[]}
    passThreshold={50} feedbackEnabled={false} feedbackRequired={false} allowSkipAll={false} cameraOnly={false} onClose={noop} t={t} {...extra} />));
}
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;
const click = (el: Element) => act(async () => { (el as HTMLElement).click(); });
const answerYes = (index: number) => click(container.querySelectorAll('[role="radiogroup"]')[index]!.querySelectorAll('input')[0]!);

describe('preview "Finish" (PR 424)', () => {
  it('has Finish, Reset and Close in the footer and shows no result before Finish', async () => {
    await render();
    const labels = [...container.querySelectorAll('footer button')].map((b) => b.textContent);
    expect(labels).toEqual(['Завершить', 'Сбросить', 'Закрыть']);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it('lists unfilled criteria on Finish, moves to the first one, and ends with the result once all are answered', async () => {
    await render();
    await answerYes(0);
    await click(button('Завершить'));
    const missing = container.querySelector('[role="alert"]')!;
    expect(missing.textContent).toContain('Лист пока нельзя завершить');
    expect(missing.textContent).toContain('Критерий 2');
    expect(missing.textContent).not.toContain('Критерий 1');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')).toBeNull();
    await answerYes(1);
    const status = container.querySelector('[data-testid="preview-finish-result"]')!;
    expect(status.textContent).toContain('Лист завершён');
    expect(status.textContent).toContain('100%');
    expect(status.textContent).not.toContain('4 / 4');
    expect(status.textContent).toContain('Зачтено');
    expect(container.querySelector('footer')!.textContent).toContain('Симуляция: ничего не сохранено');
  });
  it('shows point totals only with explicit opt-in after Finish (PR 426)', async () => {
    await render('sum_points', [item(1), item(2)], { showPointsToLearner: true });
    await answerYes(0); await answerYes(1); await click(button('Завершить'));
    expect(container.querySelector('[data-testid="preview-finish-result"]')?.textContent).toContain('4 / 4 (100%)');
  });
  it('shows "Completed" without percentages in the no-points mode', async () => {
    await render('none');
    await answerYes(0); await answerYes(1);
    await click(button('Завершить'));
    const status = container.querySelector('[data-testid="preview-finish-result"]')!;
    expect(status.textContent).toContain('Завершено');
    expect(status.textContent).not.toContain('%');
  });
  it('names required general information and feedback that are still empty', async () => {
    await render('sum_points', [item(1)], { contextFields: [{ id: 'f', label: 'Участок', type: 'text', order: 0, required: true }], feedbackEnabled: true, feedbackRequired: true });
    await answerYes(0);
    await click(button('Завершить'));
    const text = container.querySelector('[role="alert"]')!.textContent!;
    expect(text).toContain('Общая информация: обязательных полей — 1');
    expect(text).toContain('Структурированная обратная связь');
  });
  it('Reset takes the preview back to its start', async () => {
    await render();
    await click(button('Завершить'));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await click(button('Сбросить'));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe('previewUnfinishedItems', () => {
  it('counts skipped allowed criteria as finished, and photo-required ones only with a photo', () => {
    const items = [item(1, { allowSkip: true }), item(2, { photoRequired: true }), item(3)];
    const answers = { i1: { skipped: true }, i2: { answered: true, checked: true }, i3: { answered: true, checked: true } };
    expect(previewUnfinishedItems(items, 'sum_points', [], answers).map((x) => x.id)).toEqual(['i2']);
    expect(previewUnfinishedItems(items, 'sum_points', [], { ...answers, i2: { answered: true, checked: true, hasPhoto: true } })).toEqual([]);
  });
});
