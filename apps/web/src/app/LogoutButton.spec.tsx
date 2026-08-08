import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  navigate: vi.fn(),
  setError: vi.fn(),
  setLoggingOut: vi.fn(),
}));

vi.mock('../shared/logout.js', () => ({ logout: mocks.logout }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  let call = 0;
  return {
    ...actual,
    useState: vi.fn(() => {
      call += 1;
      return call % 2 === 1 ? [null, mocks.setError] : [false, mocks.setLoggingOut];
    }),
  };
});

import { LogoutButton } from './LogoutButton.js';

afterEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

function logoutHandler() {
  const tree = LogoutButton();
  const button = (tree.props as { children: Array<{ props: { onClick: () => Promise<void> } }> }).children[0];
  if (!button) throw new Error('Logout button was not rendered');
  return button.props.onClick;
}

describe('LogoutButton', () => {
  it('clears state, posts logout, and replaces history with login', async () => {
    mocks.logout.mockResolvedValueOnce(undefined);

    await logoutHandler()();

    expect(mocks.setError).toHaveBeenCalledWith(null);
    expect(mocks.setLoggingOut).toHaveBeenNthCalledWith(1, true);
    expect(mocks.navigate).toHaveBeenCalledWith('/login', { replace: true });
    expect(mocks.setLoggingOut).toHaveBeenLastCalledWith(false);
  });

  it('shows translated feedback and restores the button after failure', async () => {
    mocks.logout.mockRejectedValueOnce(new Error('offline'));

    await logoutHandler()();

    expect(mocks.setError).toHaveBeenCalledWith('Could not log out. Please try again.');
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.setLoggingOut).toHaveBeenLastCalledWith(false);
  });
});
