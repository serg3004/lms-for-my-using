// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CriterionOptions, yesNoOptions } from './CriterionOptions.js';

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(async () => { root?.unmount(); }); root = undefined; document.body.innerHTML = ''; });

async function render(props: Partial<Parameters<typeof CriterionOptions>[0]>) {
  await i18n.changeLanguage('ru');
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const onChoose = vi.fn(); const onClear = vi.fn();
  const t = i18n.t.bind(i18n) as never;
  await act(async () => { root?.render(<CriterionOptions text="Касса" number="1" required options={yesNoOptions(t, 1)} selectedKey={null} scoringMode="all_required" canClear={false} clearLabel="Снять ответ" onChoose={onChoose} onClear={onClear} {...props} />); });
  return { host, onChoose, onClear };
}
const row = (host: HTMLElement, text: string) => [...host.querySelectorAll('label')].find((l) => l.textContent?.includes(text)) as HTMLLabelElement;
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

describe('CriterionOptions (PR 448)', () => {
  it('paints a chosen "Нет" red and "Да" green, and nothing else', async () => {
    const { host } = await render({ selectedKey: 0 });
    expect(row(host, 'Нет').dataset.selected).toBe('true');
    expect(row(host, 'Нет').style.borderColor).not.toBe('transparent');
    expect(row(host, 'Да').dataset.selected).toBeUndefined();
    expect(row(host, 'Да').style.borderColor).toBe('transparent');
    expect(row(host, 'Нет').textContent).toContain('✓');
  });

  it('chooses a row, and takes the answer back on the chosen one', async () => {
    const { host, onChoose, onClear } = await render({ selectedKey: 1 });
    await act(async () => { (row(host, 'Нет').querySelector('input') as HTMLInputElement).click(); });
    expect(onChoose).toHaveBeenCalledWith(0);
    await act(async () => { (row(host, 'Да').querySelector('input') as HTMLInputElement).click(); });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows the clear button only when asked and paints "Без баллов" neutral', async () => {
    const none = await render({ canClear: false });
    expect([...none.host.querySelectorAll('button')]).toHaveLength(0);
    await act(async () => { root?.unmount(); }); root = undefined; document.body.innerHTML = '';
    const { host, onClear } = await render({ canClear: true, selectedKey: 1, scoringMode: 'none' });
    expect(row(host, 'Да').style.borderColor).not.toBe(rgb('#2E7D32'));
    await act(async () => { (host.querySelector('button') as HTMLButtonElement).click(); });
    expect(onClear).toHaveBeenCalled();
  });
});
