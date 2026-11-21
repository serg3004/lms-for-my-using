// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ listOwnSessions: vi.fn(), revokeOwnSession: vi.fn(), logoutEverywhere: vi.fn() }));
vi.mock('./api/auth.js', () => api);

import { MyDevicesCard } from './MyDevicesCard.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;
afterEach(() => { container?.remove(); container = undefined; });

const sessions = [
  { id: 'a', deviceLabel: 'Chrome · Windows', ipMasked: '203.0.x.x', createdAt: '2026-11-20T10:00:00.000Z', lastActiveAt: '2026-11-21T10:00:00.000Z', current: true },
  { id: 'b', deviceLabel: 'Safari · iOS', ipMasked: null, createdAt: '2026-11-19T10:00:00.000Z', lastActiveAt: '2026-11-20T10:00:00.000Z', current: false },
];

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container!).render(<MyDevicesCard />); });
  await act(async () => { await Promise.resolve(); });
  return container;
}
const press = async (view: HTMLElement, label: string) => { await act(async () => { [...view.querySelectorAll('button')].find((button) => button.textContent === label)!.click(); }); };

describe('MyDevicesCard (PR 494)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ru');
    api.listOwnSessions.mockReset().mockResolvedValue(sessions);
    api.revokeOwnSession.mockReset().mockResolvedValue({ revoked: true });
    api.logoutEverywhere.mockReset().mockResolvedValue({ accepted: true });
  });

  it('marks the current device, offers to end only the others, and removes an ended one', async () => {
    const view = await render();
    expect(view.textContent).toContain('Chrome · Windows (это устройство), 203.0.x.x');
    expect(view.textContent).toContain('Safari · iOS');
    expect([...view.querySelectorAll('button')].filter((button) => button.textContent === 'Завершить сеанс')).toHaveLength(1);

    await press(view, 'Завершить сеанс');

    expect(api.revokeOwnSession).toHaveBeenCalledWith('b');
    expect(view.textContent).not.toContain('Safari · iOS');
  });

  it('says so when ending a session fails and keeps the device in the list', async () => {
    api.revokeOwnSession.mockRejectedValue(new Error('network'));
    const view = await render();

    await press(view, 'Завершить сеанс');

    expect(view.textContent).toContain('Не удалось завершить сеанс');
    expect(view.textContent).toContain('Safari · iOS');
  });

  it('signs out everywhere', async () => {
    const view = await render();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });

    await press(view, 'Выйти везде');

    expect(api.logoutEverywhere).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('/login');
    vi.unstubAllGlobals();
  });
});
