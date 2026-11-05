// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from 'i18next';
import type { Appearance } from '@lms/shared/checklist-appearance';

import { AppearanceBlock, itemCardStyle } from '../../shared/AppearanceBlock.js';
import type { ChecklistItemGroup, ChecklistItemSummary } from '../../shared/api/types.js';
import { ChecklistAppearanceEditor } from './ChecklistAppearanceEditor';

const t = i18n.t.bind(i18n);
const groups = [{ id: '3f2b8c1e-5d4a-4b6f-9a7c-1e2d3c4b5a69', checklistId: 'c', title: 'Безопасность', order: 0 }] as ChecklistItemGroup[];
const items = [{ id: '4f2b8c1e-5d4a-4b6f-9a7c-1e2d3c4b5a69', text: 'Каска надета' }] as ChecklistItemSummary[];
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
let value: Appearance | null;
async function render(initial: Appearance | null = null, disabled = false) {
  value = initial;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const draw = () => root?.render(<ChecklistAppearanceEditor value={value} onChange={(next) => { value = next; void act(async () => draw()); }} groups={groups} items={items} disabled={disabled} t={t} />);
  await act(async () => draw());
}
afterEach(() => { act(() => root?.unmount()); container?.remove(); });
const byText = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.startsWith(text)) as HTMLButtonElement;
const field = (label: string) => container.querySelector<HTMLInputElement | HTMLSelectElement>(`[id="${[...container.querySelectorAll('label')].find((l) => l.textContent === label)!.htmlFor}"]`)!;
async function setValue(el: HTMLInputElement | HTMLSelectElement, next: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, next); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
}

describe('ChecklistAppearanceEditor (PR 422)', () => {
  it('sets colours and border per block kind and shows a live sample', async () => {
    await render();
    await setValue(field('Фон'), '#ffeecc');
    await setValue(field('Толщина границы'), '2');
    expect(value).toEqual({ blocks: { header: { background: '#FFEECC', borderWidth: 2 } } });
    const sample = container.querySelector<HTMLElement>('[data-testid="checklist-appearance-sample"]')!;
    expect(sample.style.backgroundColor).toBe('rgb(255, 238, 204)');
    expect(sample.style.borderWidth).toBe('2px');
  });
  it('warns about low contrast without forbidding it', async () => {
    await render({ blocks: { header: { color: '#BBBBBB', background: '#FFFFFF' } } });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Низкий контраст');
    act(() => root?.unmount()); container.remove();
    await render({ blocks: { header: { color: '#000000', background: '#FFFFFF' } } });
    expect(container.querySelectorAll('[role="status"]').length).toBe(0);
  });
  it('applies a preset and resets to the standard look', async () => {
    await render();
    await act(async () => byText('Строгий').click());
    expect(Object.keys(value!.blocks!)).toEqual(['header', 'info', 'group', 'item']);
    await act(async () => byText('Сбросить к стандартному').click());
    expect(value).toBeNull();
  });
  it('styles one group or criterion separately and can reset only that block', async () => {
    await render({ blocks: { item: { color: '#111111' } } });
    await act(async () => byText('Отдельный блок').click());
    await setValue(container.querySelector<HTMLSelectElement>('select')!, items[0]!.id);
    await setValue(field('Фон'), '#eeeeee');
    expect(value).toEqual({ blocks: { item: { color: '#111111' } }, overrides: { [items[0]!.id]: { background: '#EEEEEE' } } });
    await act(async () => byText('Сбросить этот блок').click());
    expect(value).toEqual({ blocks: { item: { color: '#111111' } } });
  });
  it('is read-only when the sheet cannot be edited', async () => {
    await render(null, true);
    expect(container.querySelector<HTMLInputElement>('input[type="color"]')!.disabled).toBe(true);
    expect(byText('Строгий').disabled).toBe(true);
  });
});

describe('AppearanceBlock', () => {
  it('renders children untouched without a style and styles the block with one', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<><AppearanceBlock appearance={null} kind="header"><i>a</i></AppearanceBlock><AppearanceBlock appearance={{ blocks: { info: { background: '#EEEEEE', radius: 12 } } }} kind="info"><b>b</b></AppearanceBlock></>));
    expect(container.innerHTML).toBe('<i>a</i><div style="background-color: rgb(238, 238, 238); border-radius: 12px;"><b>b</b></div>');
  });
  it('keeps the done cue of a styled criterion card', () => {
    const base = { padding: 16 };
    expect(itemCardStyle(null, 'x', base, '#166534', true)).toBe(base);
    expect(itemCardStyle({ blocks: { item: { background: '#FFFFFF' } } }, 'x', base, '#166534', true).boxShadow).toContain('#166534');
  });
});
