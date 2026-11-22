// @vitest-environment jsdom
import '../../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
const orgApi = vi.hoisted(() => ({ getOrganizationFeatures: vi.fn(), saveOrganizationFeatures: vi.fn() }));
vi.mock('../../shared/apiClient.js', async (original) => ({ ...(await original<object>()), apiRequest: api.apiRequest }));
vi.mock('../../shared/api/organizations.js', () => orgApi);

import { TelegramSendDialog, telegramKind } from './TelegramSendDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(HTMLDialogElement.prototype, { showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }, close(this: HTMLDialogElement) { this.removeAttribute('open'); } });
const invited = { id: 'u1', firstName: 'Анна', lastName: 'Иванова', status: 'invited' };
const active = { ...invited, status: 'active' };
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => { await i18n.changeLanguage('ru'); });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
const button = (name: string) => [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent?.trim() === name) as HTMLButtonElement | undefined;

function channel(state: { configured: boolean; enabled: boolean }, extra: Record<string, unknown> = {}) {
  api.apiRequest.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path === '/users/telegram-delivery') return { ...state, botUsername: 'bot' };
    if (path.endsWith('/deliveries')) return { linked: false, linkedAt: null, items: [] };
    if (init?.method === 'POST') return extra['post'];
    throw new Error(path);
  });
}
async function show(user: typeof invited, canEnable = false) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<TelegramSendDialog user={user} organizationId="o1" canEnable={canEnable} onClose={vi.fn()} />));
  await flush();
}

describe('TelegramSendDialog (PR 503)', () => {
  it('chooses the kind by status', () => {
    expect(telegramKind({ status: 'invited' })).toBe('invitation');
    expect(telegramKind({ status: 'active' })).toBe('temporary_password');
    expect(telegramKind({ status: 'archived' })).toBeNull();
  });

  it('says so when the bot is not configured and offers no send', async () => {
    channel({ configured: false, enabled: false });
    await show(invited);
    expect(host?.textContent).toContain('не настроен');
    expect(button('Отправить')).toBeUndefined();
  });

  it('lets only an administrator turn the channel on', async () => {
    channel({ configured: true, enabled: false });
    await show(invited);
    expect(button('Включить Telegram')).toBeUndefined();
    act(() => root?.unmount()); host?.remove();
    orgApi.getOrganizationFeatures.mockResolvedValue({ longreadEnabled: true });
    orgApi.saveOrganizationFeatures.mockResolvedValue({});
    await show(invited, true);
    await act(async () => button('Включить Telegram')?.click());
    await flush();
    expect(orgApi.saveOrganizationFeatures).toHaveBeenCalledWith('o1', { longreadEnabled: true, telegramDeliveryEnabled: true });
  });

  it('shows the bot link when the person has not pressed Start', async () => {
    channel({ configured: true, enabled: true }, { post: { status: 'awaiting_start', botLink: 'https://t.me/bot?start=abc', expiresAt: '2026-12-01T10:00:00Z' } });
    await show(invited);
    await act(async () => button('Отправить')?.click());
    await flush();
    expect(api.apiRequest).toHaveBeenCalledWith('/users/u1/telegram/invitation', expect.objectContaining({ method: 'POST' }));
    expect((host?.querySelector('input[readonly]') as HTMLInputElement).value).toBe('https://t.me/bot?start=abc');
  });

  it('asks to confirm before a temporary password goes out and reports a failure reason', async () => {
    channel({ configured: true, enabled: true }, { post: { status: 'failed', reason: 'blocked' } });
    await show(active);
    expect(button('Отправить')?.disabled).toBe(true);
    await act(async () => (host?.querySelector('input[type=checkbox]') as HTMLInputElement).click());
    expect(button('Отправить')?.disabled).toBe(false);
    await act(async () => button('Отправить')?.click());
    await flush();
    expect(api.apiRequest).toHaveBeenCalledWith('/users/u1/telegram/temporary-password', expect.objectContaining({ method: 'POST' }));
    expect(host?.textContent).toContain('заблокировал бота');
  });
});
