// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getBadgePolicy: vi.fn(), saveBadgePolicy: vi.fn() }));
vi.mock('./api/badge.js', () => api);

import { BadgePolicyCard } from './BadgePolicyCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => { await i18n.changeLanguage('ru'); });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

describe('BadgePolicyCard (PR 506)', () => {
  it('shows the policy and saves what was chosen', async () => {
    api.getBadgePolicy.mockResolvedValue({ pinRequired: true, idleMinutes: 30 });
    api.saveBadgePolicy.mockImplementation(async (_org: string, policy: unknown) => policy);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root?.render(<BadgePolicyCard organizationId="o1" />));
    await flush();
    const box = host.querySelector('input[type=checkbox]') as HTMLInputElement;
    const idle = host.querySelector('#badge-idle-minutes') as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(idle.value).toBe('30');
    await act(async () => box.click());
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(idle, '45');
      idle.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => (host?.querySelector('button[type=submit]') as HTMLButtonElement).click());
    await flush();
    expect(api.saveBadgePolicy).toHaveBeenCalledWith('o1', { pinRequired: false, idleMinutes: 45 });
    expect(host.textContent).toContain('сохранены');
  });

  it('says so when the settings cannot be loaded', async () => {
    api.getBadgePolicy.mockRejectedValue(new Error('x'));
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root?.render(<BadgePolicyCard organizationId="o1" />));
    await flush();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Не удалось загрузить');
  });
});
