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
  it('is disabled and lists what is missing', async () => {
    await render({ missing: ['Касса', 'Витрина'] });
    expect(button('Завершить проверку')?.disabled).toBe(true);
    expect(document.body.textContent).toContain('Ещё нет ответа:');
    expect(document.body.textContent).toContain('Касса');
    expect(document.body.textContent).toContain('Витрина');
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
