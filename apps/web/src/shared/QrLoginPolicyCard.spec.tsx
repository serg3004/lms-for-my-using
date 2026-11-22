// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getQrLoginPolicy: vi.fn(), saveQrLoginPolicy: vi.fn() }));
vi.mock('./api/qrLogin.js', () => api);

import { QrLoginPolicyCard } from './QrLoginPolicyCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => { await i18n.changeLanguage('ru'); });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

describe('QrLoginPolicyCard (PR 505)', () => {
  it('shows the policy, warns about wide roles and saves what was chosen', async () => {
    api.getQrLoginPolicy.mockResolvedValue({ enabled: false, sessionHours: 8, roles: ['learner', 'mentor', 'instructor'] });
    api.saveQrLoginPolicy.mockImplementation(async (_org: string, policy: unknown) => policy);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root?.render(<QrLoginPolicyCard organizationId="o1" />));
    await flush();
    const boxes = [...host.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(boxes).toHaveLength(6);
    expect(boxes[0]?.checked).toBe(false);
    expect(host.textContent).not.toContain('лучше не включать');

    await act(async () => boxes[0]?.click());
    await act(async () => boxes[5]?.click());
    expect(host.textContent).toContain('лучше не включать');
    await act(async () => (host?.querySelector('button[type=submit]') as HTMLButtonElement).click());
    await flush();
    expect(api.saveQrLoginPolicy).toHaveBeenCalledWith('o1', { enabled: true, sessionHours: 8, roles: ['learner', 'mentor', 'instructor', 'admin'] });
    expect(host.textContent).toContain('сохранены');
  });

  it('says so when the settings cannot be loaded', async () => {
    api.getQrLoginPolicy.mockRejectedValue(new Error('x'));
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root?.render(<QrLoginPolicyCard organizationId="o1" />));
    await flush();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Не удалось загрузить');
  });
});
