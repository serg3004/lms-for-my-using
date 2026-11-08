// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from 'i18next';
import type { Appearance } from '@lms/shared/checklist-appearance';

import { AppearanceBlock, itemCardStyle } from '../../shared/AppearanceBlock.js';
import { BlockGear, BlockSettingsWindow, type BlockTarget } from './ChecklistBlockSettings';

const t = i18n.t.bind(i18n);
const itemId = '4f2b8c1e-5d4a-4b6f-9a7c-1e2d3c4b5a69';
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
let value: Appearance | null;
let closed = 0;
async function render(target: BlockTarget, initial: Appearance | null = null, disabled = false) {
  value = initial; closed = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const draw = () => root?.render(<BlockSettingsWindow target={target} appearance={value} onChange={(next) => { value = next; void act(async () => draw()); }} onClose={() => { closed += 1; }} disabled={disabled} t={t} />);
  await act(async () => draw());
}
afterEach(() => { act(() => root?.unmount()); container?.remove(); });
const header: BlockTarget = { kind: 'header', id: null, name: 'Шапка' };
const item: BlockTarget = { kind: 'item', id: itemId, name: 'Каска надета' };
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent === label) as HTMLButtonElement;
async function click(el: Element | undefined) { await act(async () => (el as HTMLElement).click()); }

describe('BlockSettingsWindow (PR 431)', () => {
  it('is a non-modal dialog that sets colour, border and padding with buttons and follows the value at once', async () => {
    await render(header);
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(container.querySelector('select')).toBeNull();
    await click(button('Фон #FFF7CC'));
    await click(button('Толщина границы: 2 px'));
    await click(button('Отступ: 24 px'));
    await click(button('Скругление: 12 px'));
    expect(value).toEqual({ blocks: { header: { background: '#FFF7CC', borderWidth: 2, padding: 24, radius: 12 } } });
    expect(button('Толщина границы: 2 px').getAttribute('aria-pressed')).toBe('true');
    await click([...container.querySelectorAll('button')].filter((b) => b.textContent === 'Снять')[1]);
    expect(value?.blocks?.header).toBeDefined();
  });
  it('takes a custom colour from the colour field', async () => {
    await render(header);
    const input = container.querySelector<HTMLInputElement>('input[type="color"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#ffeecc'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(value).toEqual({ blocks: { header: { background: '#FFEECC' } } });
  });
  it('warns about low contrast without forbidding it', async () => {
    await render(header, { blocks: { header: { color: '#BBBBBB', background: '#FFFFFF' } } });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Низкий контраст');
    act(() => root?.unmount()); container.remove();
    await render(header, { blocks: { header: { color: '#000000', background: '#FFFFFF' } } });
    expect(container.querySelectorAll('[role="status"]').length).toBe(0);
  });
  it('applies a preset and resets to the standard look', async () => {
    await render(header);
    await click(button('Строгий'));
    expect(Object.keys(value!.blocks!)).toEqual(['header', 'info', 'group', 'item']);
    await click(button('Сбросить к стандартному'));
    expect(value).toBeNull();
  });
  it('applies to all blocks of the kind by default and to this block only on request', async () => {
    await render(item, { blocks: { item: { color: '#111111' } } });
    await click(button('Фон #EAF2FB'));
    expect(value).toEqual({ blocks: { item: { color: '#111111', background: '#EAF2FB' } } });
    await act(async () => (container.querySelectorAll<HTMLElement>('[role="radio"]')[1])!.click());
    await click(button('Фон #F3F4F6'));
    expect(value).toEqual({ blocks: { item: { color: '#111111', background: '#EAF2FB' } }, overrides: { [itemId]: { background: '#F3F4F6' } } });
    await click(button('Сбросить этот блок'));
    expect(value).toEqual({ blocks: { item: { color: '#111111', background: '#EAF2FB' } } });
  });
  it('offers no scope choice for the header and "General information"', async () => {
    await render(header);
    expect(container.querySelectorAll('[role="radio"]').length).toBe(0);
  });
  it('closes with the cross and with Escape, and is read-only when the sheet cannot be edited', async () => {
    await render(header, null, true);
    expect(button('Фон #FFF7CC').disabled).toBe(true);
    expect(button('Строгий').disabled).toBe(true);
    await click(button('Закрыть настройки'));
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(closed).toBe(2);
  });
  it('the block button names its block and opens the window for it', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const opened: BlockTarget[] = [];
    await act(async () => root?.render(<BlockGear target={item} active={false} onOpen={(target) => opened.push(target)} t={t} />));
    const gear = container.querySelector('button')!;
    expect(gear.getAttribute('aria-label')).toBe('Оформление блока: Каска надета');
    await click(gear);
    expect(opened).toEqual([item]);
  });
  it('PR 440: the gear is a neutral 32 px square with a 44 px touch area, accent only on hover, focus and while open', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const draw = (active: boolean) => root?.render(<BlockGear corner target={item} active={active} onOpen={() => {}} t={t} />);
    await act(async () => draw(false));
    const gear = container.querySelector<HTMLButtonElement>('button')!, square = gear.querySelector<HTMLElement>('span')!;
    expect(gear.className).toBe(''); expect(gear.getAttribute('aria-expanded')).toBe('false');
    expect(gear.style.minWidth).toBe('44px'); expect(gear.style.minHeight).toBe('44px'); expect(square.style.width).toBe('32px');
    expect(gear.style.position).toBe('absolute');
    expect(square.style.color).toBe('var(--color-text-muted, #6a6f86)');
    expect(gear.querySelector('svg circle')).not.toBeNull(); expect(gear.querySelector('svg path')?.getAttribute('d')).toContain('1.7');
    await act(async () => { gear.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); gear.focus(); });
    expect(square.style.color).toBe('var(--color-primary, #4f46e5)');
    await act(async () => { gear.blur(); });
    expect(square.style.color).toBe('var(--color-text-muted, #6a6f86)');
    await act(async () => draw(true));
    expect(gear.getAttribute('aria-expanded')).toBe('true'); expect(square.style.color).toBe('var(--color-primary, #4f46e5)');
  });
  it('PR 440: the window buttons are neutral and only the chosen value, scope and set carry the accent', async () => {
    await render(item, { blocks: { item: { background: '#EAF2FB', padding: 16 } } });
    const neutral = [...container.querySelectorAll('button')].filter((b) => b.className.includes('admin-btn--sm') && b.getAttribute('aria-label')?.startsWith('Отступ'));
    expect(neutral.length).toBeGreaterThan(0);
    for (const b of neutral) expect(b.className).toContain('admin-btn--secondary');
    expect(button('Отступ: 16 px').style.color).toBe('var(--color-primary, #4f46e5)');
    expect(button('Отступ: 24 px').style.color).toBe('');
    const close = button('Закрыть настройки'); expect(close.style.background).toBe('none');
    const unset = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Снять')!; expect(unset.style.textDecoration).toBe('underline');
    const radios = [...container.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false']);
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