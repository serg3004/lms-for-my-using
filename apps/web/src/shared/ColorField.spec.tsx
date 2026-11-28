// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColorField } from './ColorField.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render(props: Partial<Parameters<typeof ColorField>[0]> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onChange = vi.fn(), onUnset = vi.fn();
  await act(async () => root!.render(<ColorField label="Цвет" onChange={onChange} value="#C62828" {...props} />));
  return { onChange, onUnset };
}
const type = async (el: HTMLInputElement, text: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
afterEach(() => { act(() => root?.unmount()); container?.remove(); });

describe('ColorField (PR 579): the one colour field', () => {
  it('shows quick colours, one "Own colour" picker and the code box in one always-open row, with the chosen colour ringed', async () => {
    await render();
    const swatches = [...container.querySelectorAll<HTMLButtonElement>('button.color-field__swatch')];
    expect(swatches).toHaveLength(6);
    expect(swatches.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label'))).toEqual(['Цвет: #C62828']);
    expect(container.querySelectorAll('input[type="color"]')).toHaveLength(1);
    expect(container.querySelector('.color-field__custom')?.textContent).toBe('Свой цвет');
    expect(container.querySelector<HTMLInputElement>('input.color-field__hex')?.value).toBe('#C62828');
    expect(container.querySelector('[aria-expanded]')).toBeNull();
  });

  it('reports a quick colour and a colour of the picker as upper-case #RRGGBB', async () => {
    const { onChange } = await render();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Цвет: #1565C0"]')!.click());
    expect(onChange).toHaveBeenLastCalledWith('#1565C0');
    await type(container.querySelector<HTMLInputElement>('input[type="color"]')!, '#abcdef');
    expect(onChange).toHaveBeenLastCalledWith('#ABCDEF');
  });

  it('reports the typed code only when it is complete and marks an incomplete one invalid', async () => {
    const { onChange } = await render();
    const hex = container.querySelector<HTMLInputElement>('input.color-field__hex')!;
    await type(hex, '#12');
    expect(onChange).not.toHaveBeenCalled();
    expect(hex.getAttribute('aria-invalid')).toBe('true');
    await type(hex, '#123abc');
    expect(onChange).toHaveBeenCalledWith('#123ABC');
  });

  it('has a Reset button only when the colour can be unset, and the compact form has no code box', async () => {
    const onUnset = vi.fn();
    await render({ onUnset, value: undefined, compact: true });
    expect(container.querySelector('input.color-field__hex')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('.color-field__row > button:last-child')?.disabled).toBe(true);
    act(() => root?.unmount()); container.remove();
    await render({ onUnset });
    await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Снять')!.click());
    expect(onUnset).toHaveBeenCalledTimes(1);
  });

  it('locks every control when disabled', async () => {
    await render({ disabled: true });
    expect([...container.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')].every((el) => el.disabled)).toBe(true);
  });
});
