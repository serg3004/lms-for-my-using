import { setRichText } from '../../shared/richTextTest.js';
import '../../i18n/index.js';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InlineNameField, focusNameField } from './InlineNameField.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const t = ((key: string, fallback?: string | Record<string, unknown>, options?: Record<string, unknown>) => {
  const text = typeof fallback === 'string' ? fallback : key;
  return text.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options?.[name] ?? ''));
}) as unknown as TFunction;

const roots: ReturnType<typeof createRoot>[] = [];
function mount(props: Partial<Parameters<typeof InlineNameField>[0]> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const onCommit = props.onCommit ?? vi.fn(async () => undefined);
  const mountedRoot = createRoot(host); roots.push(mountedRoot);
  act(() => mountedRoot.render(<InlineNameField id="f1" label="Group title" maxLength={10} onCommit={onCommit} t={t} value="Kassa" {...props} />));
  const field = () => host.querySelector<HTMLInputElement>('#f1')!;
  const status = () => host.querySelector('[role="status"]')!;
  return { host, field, status, onCommit };
}
function type(field: HTMLInputElement, text: string) {
  act(() => {
    setRichText(field, text);
  });
}
const blur = (field: HTMLElement) => act(async () => { field.focus(); field.blur(); });
const press = (field: HTMLElement, key: string) => act(() => { field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });

describe('InlineNameField (PR 413)', () => {
  afterEach(() => { act(() => { roots.splice(0).forEach((root) => root.unmount()); }); document.body.innerHTML = ''; vi.useRealTimers(); });

  it('saves the trimmed name when the field is left, shows "Saving…" then "Saved", and the mark fades', async () => {
    vi.useFakeTimers();
    let finish: () => void = () => undefined;
    const onCommit = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { field, status } = mount({ onCommit });
    type(field(), '  Касса  ');
    await act(async () => { field().focus(); field().blur(); });
    expect(onCommit).toHaveBeenCalledWith('Касса');
    expect(status().textContent).toBe('Saving…');
    await act(async () => { finish(); });
    expect(status().textContent).toBe('Saved');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(status().textContent).toBe('');
  });

  it('saves on Enter', async () => {
    const { field, onCommit } = mount();
    act(() => field().focus());
    type(field(), 'Новая');
    await act(async () => { press(field(), 'Enter'); });
    expect(onCommit).toHaveBeenCalledWith('Новая');
  });

  it('does not save an empty, an over-long or an unchanged name, and keeps what was typed', async () => {
    const { field, status, onCommit } = mount();
    type(field(), '   ');
    await blur(field());
    expect(onCommit).not.toHaveBeenCalled();
    expect(status().textContent).toBe('Enter a name');
    expect(field().getAttribute('aria-invalid')).toBe('true');
    act(() => field().focus());
    type(field(), 'Слишком длинное название');
    await blur(field());
    expect(field().textContent).not.toBe('Слишком длинное название');
    expect(onCommit).not.toHaveBeenCalled();
    type(field(), 'Kassa');
    await blur(field());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('erasing the text does not bring the old name back while typing', () => {
    const { field } = mount();
    act(() => field().focus());
    type(field(), '');
    expect(field().textContent).toBe('');
  });

  it('Esc puts the saved name back and saves nothing', async () => {
    const { field, onCommit } = mount();
    act(() => field().focus());
    type(field(), 'Другое');
    await act(async () => { press(field(), 'Escape'); });
    expect(field().textContent).toBe('Kassa');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('applies the extra rule, e.g. a duplicate group title', async () => {
    const { field, status, onCommit } = mount({ validate: (name) => (name === 'Склад' ? 'A group with this name already exists' : null) });
    type(field(), 'Склад');
    await blur(field());
    expect(onCommit).not.toHaveBeenCalled();
    expect(status().textContent).toBe('A group with this name already exists');
  });

  it('shows the reason a save failed next to the field, keeps the text and retries', async () => {
    const onCommit = vi.fn().mockRejectedValueOnce(new Error('Нет сети')).mockResolvedValueOnce(undefined);
    const { field, status, host } = mount({ onCommit });
    type(field(), 'Касса2');
    await blur(field());
    expect(status().textContent).toContain('Нет сети');
    expect(field().textContent).toBe('Касса2');
    const retry = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Retry')!;
    await act(async () => { retry.click(); });
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(status().textContent).toBe('Saved');
  });

  it('a field that was just added says the name is missing before the first blur', () => {
    const { status } = mount({ value: '', hintWhenEmpty: true });
    expect(status().textContent).toBe('Enter a name');
  });

  it('follows a change of the saved name from outside when it is not being edited', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host); roots.push(root);
    const render = (value: string) => act(() => root.render(<InlineNameField id="f1" label="G" maxLength={10} onCommit={vi.fn()} t={t} value={value} />));
    render('A');
    render('B');
    expect(host.querySelector<HTMLInputElement>('#f1')!.textContent).toBe('B');
  });

  it('"Rename" focuses the field and selects its text; a double click selects it too', () => {
    const { field } = mount();

    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 0; });
    focusNameField('f1');
    expect(document.activeElement).toBe(field());
    expect(window.getSelection()?.toString()).toBe('Kassa');

    window.getSelection()?.removeAllRanges();
    act(() => { field().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(window.getSelection()?.toString()).toBe('Kassa');
    raf.mockRestore();
  });
});
