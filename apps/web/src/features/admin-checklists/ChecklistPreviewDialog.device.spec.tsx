// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

import type { ChecklistItemSummary } from '../../shared/api/types.js';
import { ChecklistPreviewDialog } from './ChecklistPreviewDialog';

vi.mock('../../shared/api/checklists.js', () => ({ listChecklistAnswerSets: vi.fn().mockResolvedValue([]) }));

const t = i18n.t.bind(i18n);
const item = { id: 'i1', checklistId: 'c', order: 0, text: 'Критерий', groupId: null, points: 2, weight: 1, isRequired: true, photoRequired: false, allowSkip: false, scale: null } as unknown as ChecklistItemSummary;
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  window.sessionStorage.clear();
});
afterEach(() => { act(() => root?.unmount()); container?.remove(); });
async function render(width = 1280) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  await i18n.changeLanguage('ru');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<ChecklistPreviewDialog title="Лист" description="" items={[item]} groups={[]} contextFields={[]} scoringMode="sum_points" scaleLevels={[]}
    passThreshold={50} feedbackEnabled={false} feedbackRequired={false} allowSkipAll={false} cameraOnly={false} onClose={vi.fn()} t={t} />));
}
const frame = () => container.querySelector('[data-testid="preview-frame"]') as HTMLElement;
const option = (name: string) => container.querySelector(`[data-device-option="${name}"]`) as HTMLButtonElement;

describe('preview device switch (PR 458)', () => {
  it('starts as a computer, with three pressable buttons and no width label', async () => {
    await render();
    expect(frame().dataset.device).toBe('desktop');
    expect(['desktop', 'tablet', 'phone'].map((name) => option(name).getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect([...container.querySelectorAll('.admin-preview-bar button')].map((b) => b.textContent)).toEqual(['Компьютер', 'Планшет', 'Телефон']);
    expect(container.querySelector('[data-testid="preview-device-width"]')?.textContent).toBe('');
  });
  it('switches the frame to the tablet and phone widths, shows the width and remembers the choice for the session', async () => {
    await render();
    await act(async () => option('phone').click());
    expect(frame().dataset.device).toBe('phone');
    expect(option('phone').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-testid="preview-device-width"]')?.textContent).toBe('390 px');
    expect(window.sessionStorage.getItem('lms.checklistPreviewDevice')).toBe('phone');
    await act(async () => option('tablet').click());
    expect(container.querySelector('[data-testid="preview-device-width"]')?.textContent).toBe('768 px');
    act(() => root?.unmount()); container.remove();
    await render();
    expect(frame().dataset.device).toBe('tablet');
  });
  it('does not offer a frame wider than the window and hides the switch on a small phone', async () => {
    await render(600);
    expect(option('tablet').disabled).toBe(true);
    expect(option('phone').disabled).toBe(false);
    act(() => root?.unmount()); container.remove();
    await render(375);
    expect(container.querySelector('.admin-preview-bar')).toBeNull();
    expect(frame().dataset.device).toBe('desktop');
  });
  it('falls back to the computer when the remembered device does not fit the window', async () => {
    window.sessionStorage.setItem('lms.checklistPreviewDevice', 'tablet');
    await render(600);
    expect(frame().dataset.device).toBe('desktop');
  });
});
