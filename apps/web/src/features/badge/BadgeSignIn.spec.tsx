// @vitest-environment jsdom
import '../../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ badgeLogin: vi.fn() }));
vi.mock('../../shared/api/badge.js', () => api);

import { ApiClientError } from '../../shared/apiClient';
import type { CurrentUser } from '../../shared/api/types';
import { BadgeSignIn } from './BadgeSignIn';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
const token = 'B'.repeat(43);
const user = { id: 'u1', roles: ['learner'], kiosk: true };
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); delete (window as { BarcodeDetector?: unknown }).BarcodeDetector; });
beforeEach(async () => { await i18n.changeLanguage('ru'); });
const signedInMock = () => vi.fn<(user: CurrentUser) => void>();
const flush = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
async function show(props: { initialToken?: string | null; onSignedIn?: ReturnType<typeof signedInMock> } = {}) {
  const onSignedIn = props.onSignedIn ?? signedInMock();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<MemoryRouter><BadgeSignIn initialToken={props.initialToken ?? null} onSignedIn={onSignedIn} scanMs={10} /></MemoryRouter>));
  await flush();
  return onSignedIn;
}
const button = (text: string) => [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent === text || item.getAttribute('aria-label') === text) as HTMLButtonElement;
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('BadgeSignIn (PR 506)', () => {
  it('takes the code a scanner types, asks for the PIN, and signs in with it', async () => {
    api.badgeLogin.mockResolvedValueOnce({ status: 'pinRequired' }).mockResolvedValueOnce({ status: 'ok', accessToken: 'x', user });
    const onSignedIn = await show();
    await type(host?.querySelector('#badge-code') as HTMLInputElement, `${token}\n`);
    await act(async () => (host?.querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(api.badgeLogin).toHaveBeenNthCalledWith(1, token, undefined);
    expect(host?.textContent).toContain('Введите PIN');

    for (const digit of ['4', '8', '2', '9']) await act(async () => button(`Цифра ${digit}`).click());
    expect((host?.querySelector('#badge-pin') as HTMLInputElement).value).toBe('4829');
    await act(async () => button('Войти').click());
    await flush();
    expect(api.badgeLogin).toHaveBeenNthCalledWith(2, token, '4829');
    expect(onSignedIn).toHaveBeenCalledWith(user);
  });

  it('keeps the PIN screen and says the same thing for any wrong PIN; the PIN needs 4 digits', async () => {
    api.badgeLogin.mockResolvedValueOnce({ status: 'pinRequired' }).mockRejectedValueOnce(new ApiClientError('Unauthorized', 401));
    await show({ initialToken: token });
    expect(host?.textContent).toContain('Введите PIN');
    expect(button('Войти').disabled).toBe(true);
    for (const digit of ['1', '2', '3', '4']) await act(async () => button(`Цифра ${digit}`).click());
    expect(button('Войти').disabled).toBe(false);
    await act(async () => button('Войти').click());
    await flush();
    expect(host?.querySelector('[role=alert]')?.textContent).toContain('Бейдж или PIN не подходят');
    expect((host?.querySelector('#badge-pin') as HTMLInputElement).value).toBe('');
    expect(host?.textContent).toContain('Введите PIN');
  });

  it('opens straight from a badge link and takes the token out of the address', async () => {
    window.history.replaceState(null, '', `/badge#${token}`);
    api.badgeLogin.mockResolvedValue({ status: 'ok', accessToken: 'x', user });
    const onSignedIn = await show({ initialToken: token });
    expect(api.badgeLogin).toHaveBeenCalledWith(token, undefined);
    expect(window.location.hash).toBe('');
    expect(onSignedIn).toHaveBeenCalledWith(user);
  });

  it('refuses text that is not a badge, and explains when the browser cannot read the camera', async () => {
    await show();
    await type(host?.querySelector('#badge-code') as HTMLInputElement, 'hello');
    await act(async () => (host?.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(host?.querySelector('[role=alert]')?.textContent).toContain('Бейдж или PIN не подходят');
    expect(api.badgeLogin).not.toHaveBeenCalled();

    await act(async () => button('Включить камеру').click());
    expect(host?.querySelector('[role=alert]')?.textContent).toContain('не умеет читать QR');
  });

  it('reads the badge from the camera when the browser can', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => stream) } });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(async () => undefined) });
    (window as { BarcodeDetector?: unknown }).BarcodeDetector = class { detect = vi.fn(async () => [{ rawValue: `https://lms.example/badge#${token}` }]); };
    api.badgeLogin.mockResolvedValue({ status: 'ok', accessToken: 'x', user });
    const onSignedIn = await show();
    await act(async () => button('Включить камеру').click());
    await flush(60);
    expect(api.badgeLogin).toHaveBeenCalledWith(token, undefined);
    expect(onSignedIn).toHaveBeenCalledWith(user);
    expect(stop).toHaveBeenCalled();
  });

  it('says so when the camera is refused or the server fails', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => { throw new Error('denied'); }) } });
    (window as { BarcodeDetector?: unknown }).BarcodeDetector = class { detect = vi.fn(async () => []); };
    await show();
    await act(async () => button('Включить камеру').click());
    await flush();
    expect(host?.querySelector('[role=alert]')?.textContent).toContain('Нет доступа к камере');

    api.badgeLogin.mockRejectedValue(new ApiClientError('Server', 500));
    await type(host?.querySelector('#badge-code') as HTMLInputElement, token);
    await act(async () => (host?.querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(host?.querySelector('[role=alert]')?.textContent).toContain('Не удалось выполнить вход');
  });
});
