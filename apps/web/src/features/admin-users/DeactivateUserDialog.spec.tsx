// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

import { DeactivateUserDialog, type PendingDeactivation } from './DeactivateUserDialog';
import type { AdminUserSummary } from './model.js';

Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  close(this: HTMLDialogElement) { this.removeAttribute('open'); },
});

const user = { id: 'u1', lastName: 'Ivanov', firstName: 'Ivan', status: 'active' } as AdminUserSummary;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
});

async function render(pending: PendingDeactivation | null, onConfirm = vi.fn(), onCancel = vi.fn()) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(<DeactivateUserDialog onCancel={onCancel} onConfirm={onConfirm} pending={pending} />); });
  return { host, onConfirm, onCancel };
}

describe('DeactivateUserDialog (PR 346)', () => {
  it('warns about unfinished observation sessions before the confirmation', async () => {
    await i18n.changeLanguage('ru');
    const { host } = await render({ user, observerSessions: 3 });
    expect(host.textContent).toContain('Деактивировать Ivanov Ivan?');
    expect(host.textContent).toContain('незавершённые сессии наблюдения: 3');
  });

  it('shows no warning without sessions and a neutral note when the check failed', async () => {
    await i18n.changeLanguage('en');
    const none = await render({ user, observerSessions: 0 });
    expect(none.host.textContent).not.toContain('unfinished observation sessions');
    await act(async () => { root?.unmount(); }); root = undefined; document.body.innerHTML = '';
    const unknown = await render({ user, observerSessions: null });
    expect(unknown.host.textContent).toContain('Could not check the unfinished observation sessions');
  });

  it('confirms and cancels through the dialog buttons and stays closed without a pending user', async () => {
    await i18n.changeLanguage('en');
    const { host, onConfirm, onCancel } = await render({ user, observerSessions: 1 });
    const buttons = [...host.querySelectorAll('dialog button')] as HTMLButtonElement[];
    await act(async () => { buttons.find((b) => b.textContent === 'Deactivate')?.click(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => { buttons.find((b) => b.textContent === 'Cancel')?.click(); });
    expect(onCancel).toHaveBeenCalled();
    await act(async () => { root?.unmount(); }); root = undefined; document.body.innerHTML = '';
    const closed = await render(null);
    expect(closed.host.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  });
});
