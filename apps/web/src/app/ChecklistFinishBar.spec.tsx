// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChecklistFinishBar } from './ChecklistFinishBar.js';

let root: ReturnType<typeof createRoot> | undefined;

async function render(props: { requiresReview?: boolean; missing?: string[]; onFinish?: () => Promise<void> }) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const t = i18n.t.bind(i18n) as never;
  await act(async () => { root?.render(<ChecklistFinishBar requiresReview={props.requiresReview ?? false} missing={props.missing ?? []} onFinish={props.onFinish ?? vi.fn(async () => undefined)} t={t} />); });
}
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement | undefined;
const click = async (el: HTMLElement | undefined) => { await act(async () => { el?.click(); }); };

beforeEach(async () => {
  await i18n.changeLanguage('ru');
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
});

describe('ChecklistFinishBar (PR 406б)', () => {
  it('is disabled and says only how many are left, without a list of titles (PR 449)', async () => {
    await render({ missing: ['Касса', 'Витрина'] });
    const finish = button('Завершить проверку');
    expect(finish?.disabled).toBe(true);
    expect(document.body.textContent).toContain('Осталось ответить: 2');
    expect(document.body.textContent).not.toContain('Ещё нет ответа');
    expect(document.body.textContent).not.toContain('Касса');
    expect(document.body.textContent).not.toContain('Витрина');
    expect(document.querySelector('ul')).toBeNull();
    expect(finish?.getAttribute('aria-describedby')).toBe('finish-missing');
    expect(document.getElementById('finish-missing')?.textContent).toBe('Осталось ответить: 2');
  });

  it('shows no phrase and no description when nothing is left', async () => {
    await render({ missing: [] });
    expect(document.getElementById('finish-missing')).toBeNull();
    expect(button('Завершить проверку')?.disabled).toBe(false);
    expect(button('Завершить проверку')?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('asks for confirmation before finishing', async () => {
    const onFinish = vi.fn(async () => undefined);
    await render({ onFinish });
    await click(button('Завершить проверку'));
    expect(onFinish).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('После завершения изменить ответы нельзя.');
    await click([...document.querySelectorAll('dialog button')].find((b) => b.textContent === 'Завершить проверку') as HTMLElement);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('is called "Send for review" for a sheet that an instructor checks', async () => {
    await render({ requiresReview: true });
    expect(button('Отправить на проверку')).toBeDefined();
    expect(button('Завершить проверку')).toBeUndefined();
  });

  it('can be cancelled', async () => {
    const onFinish = vi.fn(async () => undefined);
    await render({ onFinish });
    await click(button('Завершить проверку'));
    await click(button('Отмена'));
    expect(onFinish).not.toHaveBeenCalled();
  });
});
