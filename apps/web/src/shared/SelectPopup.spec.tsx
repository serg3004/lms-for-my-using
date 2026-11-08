// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectPopup } from './SelectPopup';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;
const changes: string[] = [];

function Demo({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState('text');
  return (
    <>
      <label>
        Тип поля
        <select disabled={disabled} value={value} onChange={(event) => { changes.push(event.target.value); setValue(event.target.value); }}>
          <option value="text">Текст</option>
          <option value="choice">Выбор из набора ответов</option>
          <option disabled value="off">Недоступно</option>
        </select>
      </label>
      <SelectPopup />
    </>
  );
}

async function render(disabled = false) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(<Demo disabled={disabled} />); });
  return container.querySelector('select') as HTMLSelectElement;
}
function mouse(target: Element, type: string) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
  act(() => { target.dispatchEvent(event); });
  return event;
}
function key(target: Element, name: string) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  act(() => { target.dispatchEvent(event); });
  return event;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  changes.length = 0;
  vi.restoreAllMocks();
});

describe('SelectPopup (PR 453)', () => {
  it('opens its own list with every row as text instead of the browser window', async () => {
    const select = await render();
    const down = mouse(select, 'mousedown');
    expect(down.defaultPrevented).toBe(true);
    const rows = Array.from(document.querySelectorAll('[role="option"]')).map((row) => row.textContent);
    expect(rows).toEqual(['Текст✓', 'Выбор из набора ответов', 'Недоступно']);
    expect(document.querySelector('[role="listbox"]')?.getAttribute('aria-label')).toContain('Тип поля');
  });

  it('writes the chosen row to the select and sends change', async () => {
    const select = await render();
    mouse(select, 'mousedown');
    const row = document.querySelectorAll('[role="option"]')[1] as HTMLElement;
    act(() => { row.click(); });
    expect(select.value).toBe('choice');
    expect(changes).toEqual(['choice']);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('is driven from the keyboard: Space opens, arrows move over enabled rows, Enter chooses, Escape closes', async () => {
    const select = await render();
    select.focus();
    key(select, ' ');
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    key(select, 'ArrowDown');
    key(select, 'ArrowDown');
    key(select, 'Enter');
    expect(select.value).toBe('choice');
    key(select, 'Enter');
    key(select, 'Escape');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('never chooses a disabled row and closes on an outside click', async () => {
    const select = await render();
    mouse(select, 'mousedown');
    act(() => { (document.querySelectorAll('[role="option"]')[2] as HTMLElement).click(); });
    expect(changes).toEqual([]);
    mouse(document.body, 'mousedown');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('leaves a disabled select alone', async () => {
    const select = await render(true);
    expect(mouse(select, 'mousedown').defaultPrevented).toBe(false);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });
});
