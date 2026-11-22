// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ inspectQrLogin: vi.fn(), approveQrLogin: vi.fn(), denyQrLogin: vi.fn() }));
vi.mock('../shared/api/qrLogin.js', () => api);

import { ApiClientError } from '../shared/apiClient.js';
import { QrConfirmPage } from './QrConfirmPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
const code = 'C'.repeat(43);
const info = { deviceLabel: 'Chrome · Windows', ipMasked: '10.1.x.x', createdAt: '2026-11-22T10:00:00Z', expiresAt: '2026-11-22T10:02:00Z' };
const failure = (status: number) => new ApiClientError('failed', status);
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); window.location.hash = ''; });
beforeEach(async () => { await i18n.changeLanguage('ru'); });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const button = (name: string) => [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent?.trim() === name) as HTMLButtonElement | undefined;
async function show(hash = `#${code}`) {
  window.location.hash = hash;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<MemoryRouter><QrConfirmPage /></MemoryRouter>));
  await flush();
}

describe('QrConfirmPage (PR 505)', () => {
  it('shows the device, the place and the time before anything is confirmed', async () => {
    api.inspectQrLogin.mockResolvedValue(info);
    await show();
    expect(api.inspectQrLogin).toHaveBeenCalledWith(code);
    expect(host?.textContent).toContain('Chrome · Windows');
    expect(host?.textContent).toContain('10.1.x.x');
    expect(host?.textContent).not.toContain(code);
    expect(api.approveQrLogin).not.toHaveBeenCalled();
  });

  it('confirms and declines on an explicit press', async () => {
    api.inspectQrLogin.mockResolvedValue(info);
    api.approveQrLogin.mockResolvedValue({ approved: true });
    await show();
    await act(async () => button('Подтвердить вход')?.click());
    await flush();
    expect(api.approveQrLogin).toHaveBeenCalledWith(code);
    expect(host?.textContent).toContain('Вход подтверждён');
    act(() => root?.unmount()); host?.remove();

    api.denyQrLogin.mockResolvedValue({ denied: true });
    await show();
    await act(async () => button('Это не я')?.click());
    await flush();
    expect(api.denyQrLogin).toHaveBeenCalledWith(code);
    expect(host?.textContent).toContain('Вход отклонён');
  });

  it('asks to sign in first, and treats a missing, old or foreign code alike', async () => {
    api.inspectQrLogin.mockRejectedValue(failure(401));
    await show();
    expect(host?.textContent).toContain('Сначала войдите');
    expect(host?.querySelector('a')?.getAttribute('href')).toBe('/login');
    act(() => root?.unmount()); host?.remove();

    api.inspectQrLogin.mockRejectedValue(failure(404));
    await show();
    expect(host?.textContent).toContain('недействителен');
    act(() => root?.unmount()); host?.remove();

    await show('');
    expect(host?.textContent).toContain('недействителен');
  });

  it('says when the role may not use QR', async () => {
    api.inspectQrLogin.mockResolvedValue(info);
    api.approveQrLogin.mockRejectedValue(failure(403));
    await show();
    await act(async () => button('Подтвердить вход')?.click());
    await flush();
    expect(host?.textContent).toContain('не разрешён');
  });
});
