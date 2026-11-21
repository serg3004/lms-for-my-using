// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getLoginProtection: vi.fn(),
  saveLoginProtection: vi.fn(),
  listLockedUsers: vi.fn(),
  unlockUser: vi.fn(),
}));
vi.mock('./api/organizations.js', () => api);

import { LoginProtectionCard } from './LoginProtectionCard.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;
afterEach(() => { container?.remove(); container = undefined; });

const worker = { id: 'u1', email: 'a@example.com', firstName: 'Айгуль', lastName: 'Сергеева', middleName: null, loginLockedUntil: '2026-11-21T10:30:00.000Z' };

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container!).render(<LoginProtectionCard organizationId="org-1" />); });
  await act(async () => { await Promise.resolve(); });
  return container;
}

describe('LoginProtectionCard (PR 493)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ru');
    api.getLoginProtection.mockReset().mockResolvedValue({ maxFailures: 5, windowMinutes: 15, lockMinutes: 15, logRetentionDays: 90 });
    api.saveLoginProtection.mockReset().mockImplementation(async (_org: string, settings: unknown) => settings);
    api.listLockedUsers.mockReset().mockResolvedValue([worker]);
    api.unlockUser.mockReset().mockResolvedValue({ unlocked: true });
  });

  it('shows the thresholds and sends the edited values', async () => {
    const view = await render();
    const max = view.querySelector<HTMLInputElement>('#lock-max-failures')!;
    expect(max.value).toBe('5');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(max, '7');
      max.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { view.querySelector<HTMLFormElement>('form')!.requestSubmit(); });

    expect(api.saveLoginProtection).toHaveBeenCalledWith('org-1', { maxFailures: 7, windowMinutes: 15, lockMinutes: 15, logRetentionDays: 90 });
    expect(view.textContent).toContain('Пределы сохранены');
  });

  it('lists a locked account and removes it after the unlock', async () => {
    const view = await render();
    expect(view.textContent).toContain('Сергеева Айгуль');
    expect(view.textContent).toContain('a@example.com');

    await act(async () => { [...view.querySelectorAll('button')].find((button) => button.textContent === 'Разблокировать')!.click(); });

    expect(api.unlockUser).toHaveBeenCalledWith('u1');
    expect(view.textContent).toContain('Сейчас никто не заблокирован');
  });

  it('keeps the account in the list and says so when the unlock fails', async () => {
    api.unlockUser.mockRejectedValue(new Error('network'));
    const view = await render();

    await act(async () => { [...view.querySelectorAll('button')].find((button) => button.textContent === 'Разблокировать')!.click(); });

    expect(view.textContent).toContain('Не удалось разблокировать');
    expect(view.textContent).toContain('Сергеева Айгуль');
  });
});
