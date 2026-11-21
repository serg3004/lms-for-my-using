// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getUserLoginHistory: vi.fn(), revokeUserSession: vi.fn(), revokeAllUserSessions: vi.fn() }));
vi.mock('../shared/api/auth.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../shared/api/auth.js')>()), ...api }));
vi.mock('../shared/session.js', () => ({ useSession: () => ({ currentUser: { id: 'admin', organizationId: 'org', roles: ['admin'], firstName: 'A', lastName: 'B', email: 'a@example.invalid' }, status: 'authenticated' }), useOptionalSession: () => null }));

import { AdminUserLoginsPage } from './AdminUserLoginsPage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;
afterEach(() => { container?.remove(); container = undefined; });

const history = {
  events: [
    { id: 'e1', outcome: 'success', deviceLabel: 'Chrome · Windows', ipMasked: '203.0.x.x', createdAt: '2026-11-21T10:00:00.000Z' },
    { id: 'e2', outcome: 'locked', deviceLabel: null, ipMasked: null, createdAt: '2026-11-21T09:00:00.000Z' },
  ],
  sessions: [{ id: 's1', deviceLabel: 'Chrome · Windows', ipMasked: '203.0.x.x', createdAt: '2026-11-21T10:00:00.000Z', lastActiveAt: '2026-11-21T10:05:00.000Z' }],
};

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container!).render(<MemoryRouter initialEntries={['/admin/users/u1/logins']}><Routes><Route path="/admin/users/:userId/logins" element={<AdminUserLoginsPage />} /></Routes></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
  return container;
}

describe('AdminUserLoginsPage (PR 494)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ru');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })));
    api.getUserLoginHistory.mockReset().mockResolvedValue(history);
    api.revokeUserSession.mockReset().mockResolvedValue({ revoked: 1 });
    api.revokeAllUserSessions.mockReset().mockResolvedValue({ revoked: 1 });
  });

  it('shows recent sign-ins with their outcome and the open sessions of the person', async () => {
    const view = await render();

    expect(api.getUserLoginHistory).toHaveBeenCalledWith('u1');
    expect(view.textContent).toContain('вход выполнен');
    expect(view.textContent).toContain('неверный пароль, учётная запись заблокирована');
    expect(view.textContent).toContain('Chrome · Windows');
  });

  it('ends one session or all of them and reloads', async () => {
    const view = await render();
    const press = async (label: string) => { await act(async () => { [...view.querySelectorAll('button')].find((button) => button.textContent === label)!.click(); }); };

    await press('Завершить сеанс');
    expect(api.revokeUserSession).toHaveBeenCalledWith('u1', 's1');
    await press('Завершить все сеансы');
    expect(api.revokeAllUserSessions).toHaveBeenCalledWith('u1');
    expect(api.getUserLoginHistory).toHaveBeenCalledTimes(3);
  });
});
