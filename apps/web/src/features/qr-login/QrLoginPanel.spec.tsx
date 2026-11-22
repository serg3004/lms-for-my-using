// @vitest-environment jsdom
import '../../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ startQrLogin: vi.fn(), getQrLoginStatus: vi.fn() }));
vi.mock('../../shared/api/qrLogin.js', () => api);

import { QrLoginPanel } from './QrLoginPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
const code = 'C'.repeat(43);
const user = { id: 'u1', roles: ['learner'] };
const later = () => new Date(Date.now() + 120_000).toISOString();
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => { await i18n.changeLanguage('ru'); api.startQrLogin.mockResolvedValue({ code, pollToken: 'P'.repeat(43), expiresAt: later() }); });
const flush = (ms = 40) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
async function show(onSignedIn = vi.fn()) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<QrLoginPanel onSignedIn={onSignedIn} pollMs={10} />));
  await flush();
  return onSignedIn;
}

describe('QrLoginPanel (PR 505)', () => {
  it('draws the QR with the code after # and never prints the code or the secret as text', async () => {
    api.getQrLoginStatus.mockResolvedValue({ status: 'pending' });
    await show();
    const image = host?.querySelector('img') as HTMLImageElement;
    expect(image).not.toBeNull();
    expect(host?.textContent).not.toContain(code);
    expect(host?.textContent).not.toContain('P'.repeat(43));
    expect(host?.textContent).toContain('Ждём подтверждения');
    expect(host?.querySelector('[role=timer]')?.textContent).toMatch(/\d+ с/);
  });

  it('signs in when the phone confirms', async () => {
    api.getQrLoginStatus.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValue({ status: 'approved', accessToken: 'x', user });
    const onSignedIn = await show();
    await flush();
    expect(onSignedIn).toHaveBeenCalledWith(user);
  });

  it('shows a refusal and asks for a fresh code when the old one expired', async () => {
    api.getQrLoginStatus.mockResolvedValue({ status: 'denied' });
    await show();
    expect(host?.textContent).toContain('отклонён');
    api.getQrLoginStatus.mockResolvedValue({ status: 'pending' });
    const before = api.startQrLogin.mock.calls.length;
    await act(async () => ([...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent === 'Новый код') as HTMLButtonElement).click());
    await flush();
    expect(api.startQrLogin.mock.calls.length).toBe(before + 1);

    api.getQrLoginStatus.mockResolvedValueOnce({ status: 'expired' }).mockResolvedValue({ status: 'pending' });
    await flush(60);
    expect(api.startQrLogin.mock.calls.length).toBeGreaterThan(before + 1);
  });

  it('says so when no code could be started', async () => {
    api.startQrLogin.mockRejectedValue(new Error('network'));
    await show();
    expect(host?.querySelector('[role=alert]')?.textContent).toContain('Не удалось получить код');
  });
});
