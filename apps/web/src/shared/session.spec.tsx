// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('./api/auth.js', () => ({ getCurrentUser: mocks.getCurrentUser }));

import { SessionProvider, useSession } from './session.js';
import type { CurrentUser } from './api/types.js';

const user: CurrentUser = {
  id: 'user-1', organizationId: 'org-1', email: 'user@example.com', firstName: 'Ada', lastName: 'Lovelace',
  middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'en', timezone: 'UTC', roles: ['learner'],
};

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  vi.clearAllMocks();
});

function Consumer() {
  const { currentUser, status, refreshUser, clearSession } = useSession();
  return <><span>{status}:{currentUser?.firstName ?? '-'}</span><button onClick={() => void refreshUser()}>refresh</button><button onClick={clearSession}>clear</button></>;
}

describe('SessionProvider', () => {
  it('loads the authenticated user once and shares it with consumers', async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => { root?.render(<SessionProvider authenticated><Consumer /><Consumer /></SessionProvider>); });

    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('authenticated:Ada');
  });

  it('does not load on public routes and supports refresh and clear', async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => { root?.render(<SessionProvider authenticated={false}><Consumer /></SessionProvider>); });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();

    await act(async () => { (container.querySelectorAll('button')[0] as HTMLButtonElement).click(); });
    expect(container.textContent).toContain('authenticated:Ada');
    act(() => { (container.querySelectorAll('button')[1] as HTMLButtonElement).click(); });
    expect(container.textContent).toContain('idle:-');
  });
});
