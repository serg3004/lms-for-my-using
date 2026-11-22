// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InstallHint } from './InstallHint';
import { isIosBrowser, listenForInstallOffer, registerServiceWorker, wasDismissed } from './pwa';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.restoreAllMocks(); window.localStorage.clear(); });
beforeEach(async () => { await i18n.changeLanguage('en'); });
async function show() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<InstallHint />));
}
const button = (name: string) => [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent === name) as HTMLButtonElement | undefined;

describe('isIosBrowser', () => {
  it('recognises an iPhone, an iPad that looks like a Mac, and not an Android phone or a desktop', () => {
    expect(isIosBrowser(iphone, 5)).toBe(true);
    expect(isIosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 5)).toBe(true);
    expect(isIosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 0)).toBe(false);
    expect(isIosBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36', 5)).toBe(false);
  });
});

describe('InstallHint (PR 357)', () => {
  it('shows nothing where the site cannot be installed', async () => {
    await show();
    expect(host?.innerHTML).toBe('');
  });

  it('offers the browser install once, then stays hidden', async () => {
    listenForInstallOffer();
    await show();
    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }) });
    await act(async () => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(host?.textContent).toContain('Install to your home screen');
    await act(async () => button('Install')?.click());
    await act(async () => { await Promise.resolve(); });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(host?.innerHTML).toBe('');
    expect(wasDismissed()).toBe(true);
  });

  it('shows the Share instruction on an iPhone and remembers "Not now"', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(iphone);
    await show();
    expect(host?.textContent).toContain('Add to Home Screen');
    expect(button('Install')).toBeUndefined();
    await act(async () => button('Not now')?.click());
    expect(host?.innerHTML).toBe('');
    act(() => root?.unmount()); host?.remove();
    await show();
    expect(host?.innerHTML).toBe('');
  });

  it('is hidden when the app is already installed', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(iphone);
    window.matchMedia = ((query: string) => ({ matches: query.includes('standalone'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    await show();
    expect(host?.innerHTML).toBe('');
  });
});

describe('registerServiceWorker', () => {
  it('does nothing outside production or without HTTPS', () => {
    const register = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, 'serviceWorker', { value: { register }, configurable: true });
    const add = vi.spyOn(window, 'addEventListener');
    registerServiceWorker({ prod: false });
    registerServiceWorker({ prod: true });
    expect(add).not.toHaveBeenCalledWith('load', expect.anything());
    expect(register).not.toHaveBeenCalled();
  });
});
