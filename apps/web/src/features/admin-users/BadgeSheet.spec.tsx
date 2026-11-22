// @vitest-environment jsdom
import '../../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getBadgeState: vi.fn(), issueBadges: vi.fn(), resetBadgePin: vi.fn(), revokeBadge: vi.fn() }));
vi.mock('../../shared/api/badge.js', () => api);

import { BadgeSheet } from './BadgeSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
const token = 'K'.repeat(43);
const card = { userId: 'u1', token, pin: '4821', firstName: 'Айгуль', lastName: 'Каримова', middleName: null, employeeNumber: 'T-17' };
afterEach(() => { act(() => root?.unmount()); host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks(); });
beforeEach(async () => {
  await i18n.changeLanguage('ru');
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
async function show(props: { userIds: string[]; single?: boolean }) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<BadgeSheet {...props} />));
  await flush();
}
const button = (text: string) => [...document.querySelectorAll('button')].find((item) => item.textContent === text) as HTMLButtonElement;

describe('BadgeSheet (PR 506)', () => {
  it('issues only after a confirmation, draws the QR with the token after # and keeps the PIN out of the printed card', async () => {
    api.issueBadges.mockResolvedValue({ items: [card], skipped: 2 });
    await show({ userIds: ['u1', 'u2', 'u3'] });
    await act(async () => button('Бейдж').click());
    expect(api.issueBadges).not.toHaveBeenCalled();
    await act(async () => button('Выдать бейдж').click());
    await flush();
    expect(api.issueBadges).toHaveBeenCalledWith(['u1', 'u2', 'u3']);

    const printed = document.querySelector('.activation-qr-print') as HTMLElement;
    expect(printed.textContent).toContain('Каримова Айгуль');
    expect(printed.textContent).toContain('T-17');
    expect(printed.textContent).not.toContain('4821');
    expect(printed.textContent).not.toContain(token);
    const link = printed.querySelector('a') as HTMLAnchorElement;
    expect(link.href).toContain(`/badge#${token}`);
    // The PIN is on screen for the administrator, in its own table.
    expect(document.querySelector('table')?.textContent).toContain('4821');
    expect(document.body.textContent).toContain('Пропущено: 2');
  });

  it('says so when the badges could not be issued', async () => {
    api.issueBadges.mockRejectedValue(new Error('x'));
    await show({ userIds: ['u1'] });
    await act(async () => button('Бейдж').click());
    await act(async () => button('Выдать бейдж').click());
    await flush();
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Не удалось выдать');
  });

  it('for one person shows the state, resets the PIN and revokes the badge after a confirmation', async () => {
    api.getBadgeState.mockResolvedValue({ badge: { state: 'active', issuedAt: '2026-11-20T10:00:00Z', revokedAt: null, lastUsedAt: null, pinLockedUntil: null } });
    api.resetBadgePin.mockResolvedValue({ pin: '9035' });
    api.revokeBadge.mockResolvedValue({ closed: true });
    await show({ userIds: ['u1'], single: true });
    await act(async () => button('Бейдж').click());
    await flush();
    expect(document.body.textContent).toContain('Состояние бейджа: действует');

    await act(async () => button('Сбросить PIN').click());
    await flush();
    expect(api.resetBadgePin).toHaveBeenCalledWith('u1');
    expect(document.body.textContent).toContain('Новый PIN: 9035');

    await act(async () => button('Отозвать бейдж').click());
    expect(api.revokeBadge).not.toHaveBeenCalled();
    await act(async () => button('Отозвать бейдж').click());
    await flush();
    expect(api.revokeBadge).toHaveBeenCalledWith('u1');
  });
});
