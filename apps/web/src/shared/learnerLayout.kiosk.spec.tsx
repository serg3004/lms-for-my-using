// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { current: { id: 'u1', firstName: 'Айгуль', lastName: 'Каримова', email: 'a@example.test', roles: ['learner'], kiosk: true } as Record<string, unknown> },
  clearSession: vi.fn(),
  logout: vi.fn(async () => undefined),
}));
vi.mock('./session.js', () => ({ useOptionalSession: () => ({ currentUser: mocks.user.current, clearSession: mocks.clearSession }) }));
vi.mock('./logout.js', () => ({ logout: mocks.logout }));
vi.mock('./apiClient.js', async () => ({
  ...(await vi.importActual<object>('./apiClient.js')),
  getUnreadNotificationCount: vi.fn(async () => ({ count: 0 })),
  listNotifications: vi.fn(async () => []),
}));

import { SESSION_ENDED_EVENT } from './apiClient';
import { LearnerPageLayout } from './learnerLayout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
const assign = vi.fn();
const original = window.location;
beforeEach(async () => {
  await i18n.changeLanguage('ru');
  mocks.user.current = { id: 'u1', firstName: 'Айгуль', lastName: 'Каримова', email: 'a@example.test', roles: ['learner'], kiosk: true };
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
  Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign, pathname: '/learn', href: '/learn' } });
});
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); Object.defineProperty(window, 'location', { configurable: true, value: original }); });
async function show() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<MemoryRouter><LearnerPageLayout currentPath="/learn"><p>content</p></LearnerPageLayout></MemoryRouter>));
}

describe('LearnerPageLayout in a kiosk session (PR 506)', () => {
  it('shows only assigned work in the menu, no profile or certificates, and a finish button instead of the account switcher', async () => {
    await show();
    const links = [...(host?.querySelectorAll('nav a') ?? [])].map((item) => item.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(['/learn', '/learn/assignments', '/learn/checklists']));
    expect(links).not.toContain('/profile');
    expect(links).not.toContain('/learn/certificates');
    expect(links).not.toContain('/learn/notifications');
    expect(host?.textContent).toContain('Закончить работу');
    expect(host?.textContent).toContain('вошли по бейджу');
  });

  it('returns to the badge scan when the session ends, and after finishing work', async () => {
    await show();
    await act(async () => { window.dispatchEvent(new Event(SESSION_ENDED_EVENT)); });
    expect(assign).toHaveBeenCalledWith('/badge');

    const finish = [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent === 'Закончить работу') as HTMLButtonElement;
    await act(async () => finish.click());
    expect(mocks.logout).toHaveBeenCalled();
    expect(window.location.href).toBe('/badge');
  });

  it('keeps the usual menu and does not listen for the end of a session for an ordinary sign-in', async () => {
    mocks.user.current = { ...mocks.user.current, kiosk: undefined };
    await show();
    const links = [...(host?.querySelectorAll('nav a') ?? [])].map((item) => item.getAttribute('href'));
    expect(links).toContain('/profile');
    await act(async () => { window.dispatchEvent(new Event(SESSION_ENDED_EVENT)); });
    expect(assign).not.toHaveBeenCalled();
    expect(host?.textContent).not.toContain('Закончить работу');
  });
});
