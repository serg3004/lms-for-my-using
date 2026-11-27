// @vitest-environment jsdom
import '../../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../../shared/apiClient.js', async (original) => ({ ...(await original<object>()), apiRequest: api.apiRequest }));

import { LinkSendDialog } from './LinkSendDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(HTMLDialogElement.prototype, { showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }, close(this: HTMLDialogElement) { this.removeAttribute('open'); } });
const person = { id: 'u1', firstName: 'Анна', lastName: 'Иванова' };
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => { await i18n.changeLanguage('ru'); });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
const button = (name: string) => [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent?.trim() === name) as HTMLButtonElement | undefined;

function backend(telegram: { configured: boolean; enabled: boolean }, post: unknown) {
  api.apiRequest.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    if (path === '/users/telegram-delivery') return { ...telegram, botUsername: 'bot' };
    if (init?.method === 'POST') return post;
    throw new Error(path);
  });
}
async function show(sessionId?: string) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<LinkSendDialog user={person} sessionId={sessionId} onClose={vi.fn()} />));
  await flush();
}

describe('LinkSendDialog (PR 572)', () => {
  it('offers e-mail always and Telegram only when the channel is on', async () => {
    backend({ configured: true, enabled: false }, { status: 'sent' });
    await show();
    expect(button('Письмом')).toBeTruthy();
    expect(button('В Telegram')).toBeUndefined();
  });

  it('sends the install link by e-mail and says so', async () => {
    backend({ configured: false, enabled: false }, { status: 'sent' });
    await show();
    await act(async () => button('Письмом')!.click());
    await flush();
    const post = api.apiRequest.mock.calls.find((call) => (call[1] as { method?: string } | undefined)?.method === 'POST')!;
    expect(post[0]).toBe('/users/u1/links');
    expect(JSON.parse((post[1] as { body: string }).body)).toEqual({ channel: 'email' });
    expect(host?.textContent).toContain('Письмо отправлено.');
  });

  it('sends the link of one check through Telegram and hands over the bot link when the person has not pressed Start', async () => {
    backend({ configured: true, enabled: true }, { status: 'awaiting_start', botLink: 'https://t.me/bot?start=abc', expiresAt: '2026-12-01T00:00:00Z' });
    await show('s1');
    expect(host?.textContent).toContain('Отправить ссылку на проверку');
    await act(async () => button('В Telegram')!.click());
    await flush();
    const post = api.apiRequest.mock.calls.find((call) => (call[1] as { method?: string } | undefined)?.method === 'POST')!;
    expect(JSON.parse((post[1] as { body: string }).body)).toEqual({ channel: 'telegram', sessionId: 's1' });
    expect((host?.querySelector('input[readonly]') as HTMLInputElement).value).toBe('https://t.me/bot?start=abc');
  });
});
