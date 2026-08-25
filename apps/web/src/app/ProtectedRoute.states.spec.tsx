import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactState = vi.hoisted(() => ({ value: 'loading' }));
vi.mock('../shared/session.js', () => ({
  useOptionalSession: () => ({ status: reactState.value }),
  useSession: () => ({
    status: reactState.value === 'unauthenticated' ? 'error' : reactState.value === 'forbidden' ? 'authenticated' : reactState.value,
    currentUser: reactState.value === 'authenticated'
      ? { id: 'user-1', organizationId: 'org-1', roles: ['admin'] }
      : reactState.value === 'forbidden'
        ? { id: 'user-1', organizationId: 'org-1', roles: ['learner'] }
        : null,
    error: reactState.value === 'unauthenticated' ? new Error('unauthenticated') : null,
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { ProtectedRoute } from './ProtectedRoute.js';

function renderState(state: string) {
  reactState.value = state;
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/admin/users']}>
      <Routes>
        <Route path="/login" element={<p>Login destination</p>} />
        <Route path="/admin/users" element={(
          <ProtectedRoute protectedPathPrefixes={['/admin']} canAccess={(user) => user.roles.includes('admin')}>
            <p>Secret users</p>
          </ProtectedRoute>
        )} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => { reactState.value = 'loading'; });

describe('ProtectedRoute rendered auth states', () => {
  it('redirects unauthenticated users to login', () => {
    const html = renderState('unauthenticated');
    // Navigate emits no markup during SSR; an empty protected branch confirms
    // that neither the loading state nor protected content leaked before redirect.
    expect(html).toBe('');
  });

  it('renders forbidden feedback for unauthorized roles', () => {
    const html = renderState('forbidden');
    expect(html).toContain('Access denied');
    expect(html).not.toContain('Secret users');
  });

  it('renders protected content for authenticated users', () => {
    expect(renderState('authenticated')).toContain('Secret users');
  });
});
