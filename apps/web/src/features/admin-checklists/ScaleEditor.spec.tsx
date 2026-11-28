// @vitest-environment jsdom
import '../../i18n/index.js';

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from 'i18next';
import { ScaleEditor, newScaleEditor, type ScaleEditorState } from './ScaleEditor.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const t = i18n.t.bind(i18n);
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
let latest: ScaleEditorState;
function Host({ initial }: { initial: ScaleEditorState }) {
  const [editor, setEditor] = useState(initial);
  latest = editor;
  return <ScaleEditor editor={editor} onChange={setEditor} t={t} />;
}
async function render(initial: ScaleEditorState) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<Host initial={initial} />));
}
afterEach(() => { act(() => root?.unmount()); container?.remove(); });
const labelsOf = (li: Element) => [...li.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'));

describe('ScaleEditor (PR 579)', () => {
  it('draws every level the same way: handle, name, points, buttons, then the colour, with column labels above', async () => {
    const editor = { ...newScaleEditor(), name: 'Качество' };
    await render({ ...editor, levels: [...editor.levels, { ...editor.levels[0]!, key: 'third', label: 'Среднее', score: '50' }] });
    const rows = [...container.querySelectorAll('ol.scale-levels > li')];
    expect(rows).toHaveLength(3);
    const shape = (li: Element) => [...li.children].map((el) => el.className);
    expect(rows.map(shape).every((s) => JSON.stringify(s) === JSON.stringify(shape(rows[0]!)))).toBe(true);
    expect(shape(rows[0]!)).toEqual(['admin-drag scale-level__handle', 'scale-level__name', 'scale-level__score', 'scale-level__actions', 'scale-level__color']);
    expect(container.querySelector('.scale-levels__head')?.textContent).toBe('НазваниеБаллы');
    expect(labelsOf(rows[0]!)).toContain('Перетащить уровень 1');
    expect(container.querySelectorAll('input[type="color"]')).toHaveLength(3);
  });

  it('keeps the up, down and remove buttons for the keyboard and reorders at once', async () => {
    await render(newScaleEditor());
    const names = () => [...container.querySelectorAll<HTMLInputElement>('input[aria-label^="Название уровня"]')].map((input) => input.value);
    const before = latest.levels.map((level) => level.label);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Опустить уровень 1"]')!.click());
    expect(latest.levels.map((level) => level.label)).toEqual([...before].reverse());
    expect(names()).toEqual([...before].reverse());
  });

  it('shows the preview next to the levels with the name and points of every level', async () => {
    await render(newScaleEditor());
    const preview = container.querySelector('section.scale-preview')!;
    expect(preview.getAttribute('aria-label')).toBe('Предпросмотр');
    expect(preview.querySelectorAll('li')).toHaveLength(latest.levels.length);
    expect(container.querySelector('.scale-editor')?.contains(preview)).toBe(true);
  });

  it('has no handles, buttons or colour changes in a read-only scale', async () => {
    await render({ ...newScaleEditor(), readOnly: true });
    expect(container.querySelector('.scale-level__handle')).toBeNull();
    expect(container.querySelector('.scale-level__actions')?.textContent).toBe('');
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="color"], .color-field__hex')].every((el) => el.disabled)).toBe(true);
  });
});
