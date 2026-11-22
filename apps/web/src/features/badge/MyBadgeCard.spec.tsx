// @vitest-environment jsdom
import '../../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getOwnBadge: vi.fn(), changeOwnBadgePin: vi.fn(), reportOwnBadgeLost: vi.fn() }));
vi.mock('../../shared/api/badge.js', () => api);

import { MyBadgeCard } from './MyBadgeCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => { await i18n.changeLanguage('ru'); HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }; HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.removeAttribute('open'); }; });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
async function show() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<MyBadgeCard />));
  await flush();
}
const button = (text: string) => [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent === text) as HTMLButtonElement;

describe('MyBadgeCard (PR 506)', () => {
  it('shows nothing for a person without a badge, and nothing when the lookup fails', async () => {
    api.getOwnBadge.mockResolvedValue({ badge: null, pinRequired: true });
    await show();
    expect(host?.textContent).toBe('');
    act(() => root?.unmount()); host?.remove();
    api.getOwnBadge.mockRejectedValue(new Error('x'));
    await show();
    expect(host?.textContent).toBe('');
  });

  it('shows the badge without its token and changes the PIN with 4 to 6 digits', async () => {
    api.getOwnBadge.mockResolvedValue({ badge: { issuedAt: '2026-11-20T10:00:00Z', lastUsedAt: null }, pinRequired: true });
    api.changeOwnBadgePin.mockResolvedValue({ changed: true });
    await show();
    expect(host?.textContent).toContain('Мой бейдж');
    expect(host?.textContent).toContain('ещё не использовался');
    const input = host?.querySelector('#my-badge-pin') as HTMLInputElement;
    expect(button('Сменить PIN').disabled).toBe(true);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '48a2915');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input.value).toBe('482915');
    await act(async () => (host?.querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(api.changeOwnBadgePin).toHaveBeenCalledWith('482915');
    expect(host?.textContent).toContain('PIN изменён');
  });

  it('reports the badge lost only after a confirmation, and then shows the result', async () => {
    api.getOwnBadge.mockResolvedValue({ badge: { issuedAt: '2026-11-20T10:00:00Z', lastUsedAt: '2026-11-21T10:00:00Z' }, pinRequired: false });
    api.reportOwnBadgeLost.mockResolvedValue({ lost: true });
    await show();
    expect(host?.textContent).toContain('не требует PIN');
    await act(async () => button('Бейдж потерян').click());
    expect(api.reportOwnBadgeLost).not.toHaveBeenCalled();
    const confirm = [...document.querySelectorAll('dialog button')].find((item) => item.textContent === 'Бейдж потерян') as HTMLButtonElement;
    await act(async () => confirm.click());
    await flush();
    expect(api.reportOwnBadgeLost).toHaveBeenCalledTimes(1);
    expect(host?.textContent).toContain('Бейдж отозван');
  });
});
