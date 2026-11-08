// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

import type { ChecklistItemSummary } from '../../shared/api/types.js';
import { ChecklistPreviewDialog } from './ChecklistPreviewDialog';

vi.mock('../../shared/api/checklists.js', () => ({ listChecklistAnswerSets: vi.fn().mockResolvedValue([]), getChecklistPhotoBlob: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' })) }));

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
const radios = (index: number) => [...container.querySelectorAll('[role="radiogroup"]')[index]!.querySelectorAll('input')] as HTMLInputElement[];
const optionOf = (input: HTMLInputElement) => input.closest('label') as HTMLElement;
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

describe('preview: the pictures of the sheet come first (PR 445)', () => {
  it('puts the strip above the title and shows no heading for it', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
    await render('sum_points', [item(1)], { checklistId: 'c1', showSheetPhotos: true, photos: [{ id: 'p1', caption: '', order: 0, updatedAt: '2026-11-05T00:00:00.000Z' }] });
    const strip = container.querySelector('button[aria-label^="Открыть изображение 1"]')!;
    const title = container.querySelector('h2')!;
    expect(strip.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('h3.ui-visually-hidden')?.textContent).toBe('Изображение на бланке чек-листа');
  });
});

describe('preview: the look of the feedback section (PR 442)', () => {
  it('styles the feedback section with the author\'s look and leaves it plain without one', async () => {
    await render('sum_points', [item(1)], { feedbackEnabled: true });
    expect([...container.querySelectorAll('div')].some((d) => d.style.backgroundColor === rgb('#FFF7CC'))).toBe(false);
    act(() => root?.unmount()); container.remove();
    await render('sum_points', [item(1)], { feedbackEnabled: true, appearance: { blocks: { feedback: { background: '#FFF7CC', borderWidth: 3, borderColor: '#172033' } } } });
    const section = container.querySelector('section[aria-label]:has(h3)') as HTMLElement;
    const frame = [...container.querySelectorAll('div')].find((d) => d.style.backgroundColor === rgb('#FFF7CC'));
    expect(frame).toBeDefined();
    expect(frame!.contains(section)).toBe(true);
    expect(frame!.style.borderWidth).toBe('3px');
  });
});

describe('preview answers: take back and level colour (PR 425)', () => {
  it('washes the chosen Yes/No with its colour, adds a tick and takes the answer back on a second click', async () => {
    await render();
    await click(radios(0)[0]!);
    expect(radios(0)[0]!.checked).toBe(true);
    expect(optionOf(radios(0)[0]!).style.borderColor).toBe(rgb('#2E7D32'));
    expect(optionOf(radios(0)[0]!).textContent).toContain('✓');
    await click(radios(0)[1]!);
    expect(optionOf(radios(0)[1]!).style.borderColor).toBe(rgb('#C62828'));
    expect(optionOf(radios(0)[0]!).style.backgroundColor).toBe('');
    await click(radios(0)[1]!);
    expect(radios(0)[1]!.checked).toBe(false);
    expect(radios(0).some((radio) => radio.checked)).toBe(false);
  });

  it('has a "Clear answer" button that returns the criterion to unanswered, so Finish lists it again', async () => {
    await render();
    await click(radios(0)[0]!);
    await click(radios(1)[0]!);
    expect(button('Снять ответ')).toBeTruthy();
    await click(button('Снять ответ'));
    await click(button('Завершить'));
    const missing = container.querySelector('[data-testid="preview-finish-missing"]')!;
    expect(missing.textContent).toContain('Критерий 1');
    expect(missing.textContent).not.toContain('Критерий 2');
  });

  it('paints a chosen scale level with the colour of its scale, or by its score when it has none', async () => {
    const scaled = item(1, { scale: { id: 's', name: 'S', levels: [{ value: 1, label: 'Плохо', score: 0, color: '#1565C0' }, { value: 2, label: 'Средне', score: 5 }, { value: 3, label: 'Отлично', score: 10 }] } });
    await render('sum_points', [scaled]);
    await click(radios(0)[0]!);
    expect(optionOf(radios(0)[0]!).style.borderColor).toBe(rgb('#1565C0'));
    await click(radios(0)[1]!);
    expect(optionOf(radios(0)[1]!).style.borderColor).toBe(rgb('#E65100'));
    await click(radios(0)[2]!);
    expect(optionOf(radios(0)[2]!).style.borderColor).toBe(rgb('#2E7D32'));
  });

  it('paints neutral without points and still lets the answer be taken back', async () => {
    await render('none');
    await click(radios(0)[0]!);
    expect(optionOf(radios(0)[0]!).style.borderColor).toBe(rgb('#475569'));
    await click(button('Снять ответ'));
    expect(radios(0).some((radio) => radio.checked)).toBe(false);
  });
});

describe('preview: «Ungrouped criteria» only next to real groups, and a gap between blocks (PR 447)', () => {
  const group = { id: 'g1', checklistId: 'c', title: 'Безопасность', order: 0 };
  const headings = () => [...container.querySelectorAll('h3')].map((h) => h.textContent);
  const field = { id: 'f1', label: 'Участок', type: 'text', required: false, order: 0 };

  it('shows the criteria of a sheet without groups with no group title', async () => {
    await render('sum_points', [item(1), item(2)]);
    expect(headings().some((text) => text?.includes('Без группы'))).toBe(false);
    expect(container.textContent).toContain('Критерий 1');
  });

  it('keeps the group titles of a sheet with groups and names the rest', async () => {
    await render('sum_points', [item(1, { groupId: 'g1' }), item(2)], { groups: [group] });
    expect(headings()).toEqual(expect.arrayContaining([expect.stringContaining('Безопасность'), expect.stringContaining('Без группы')]));
  });

  it('keeps the gap after «General information» even when the author styled nothing', async () => {
    await render('sum_points', [item(1)], { contextFields: [field] });
    const info = container.querySelector('section[aria-label="Общая информация"]')!;
    expect((info.parentElement as HTMLElement).style.marginBottom).toBe('12px');
  });
});
