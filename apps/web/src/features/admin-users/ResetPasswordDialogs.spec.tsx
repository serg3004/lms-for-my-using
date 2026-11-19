// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

import { ResetPasswordDialogs, type PasswordResetResult } from './ResetPasswordDialogs';
import type { AdminUserSummary } from './model.js';

Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  close(this: HTMLDialogElement) { this.removeAttribute('open'); },
});

const user = { id: 'u1', lastName: 'Ivanov', firstName: 'Ivan', email: 'ivan@example.test', status: 'active' } as AdminUserSummary;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
});

async function render(pending: AdminUserSummary | null, result: PasswordResetResult | null, onConfirm = vi.fn()) {
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(<ResetPasswordDialogs onCancel={vi.fn()} onClose={vi.fn()} onConfirm={onConfirm} pending={pending} result={result} />); });
  return { host, onConfirm };
}

describe('ResetPasswordDialogs', () => {
  it('asks for confirmation naming the user', async () => {
    const { host } = await render(user, null);
    expect(host.textContent).toContain('Ivanov Ivan');
  });

  it('says where the link went when it was emailed', async () => {
    const { host } = await render(null, { user, delivered: true });
    expect(host.textContent).toContain('ivan@example.test');
  });

  it('shows the one-time link when mail is not set up', async () => {
    const { host } = await render(null, { user, delivered: false, resetUrl: 'https://lms.test/password-reset?token=abc' });
    expect(host.textContent).toContain('https://lms.test/password-reset?token=abc');
  });
});
