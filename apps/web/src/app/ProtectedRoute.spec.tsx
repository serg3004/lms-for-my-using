import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ApiClientError } from '../shared/apiClient';
import type { CurrentUser } from '../shared/api/types';
import { getProtectedRouteAuthState, getProtectedRouteErrorState, ProtectedRoute } from './ProtectedRoute';

const currentUser: CurrentUser = {
  id: 'user-1',
  organizationId: 'org-1',
  email: 'learner@example.com',
  firstName: 'Learner',
  lastName: 'User',
  middleName: null,
  position: null,
  shift: null,
  phone: null,
  status: 'active',
  locale: 'en',
  timezone: 'UTC',
  roles: ['learner'],
};

describe('ProtectedRoute', () => {
  it('renders loading state for protected paths before auth resolves', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/learn']}>
        <ProtectedRoute protectedPathPrefixes={['/learn']}>
          <p>Protected content</p>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('Loading...');
  });

  it('renders children immediately for unprotected paths', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/login']}>
        <ProtectedRoute protectedPathPrefixes={['/learn']}>
          <p>Public content</p>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(html).toContain('Public content');
  });

  it('resolves authenticated state when access is allowed', () => {
    expect(getProtectedRouteAuthState(currentUser, (user) => user.roles.includes('learner'))).toBe('authenticated');
  });

  it('resolves forbidden state when access is denied', () => {
    expect(getProtectedRouteAuthState(currentUser, (user) => user.roles.includes('admin'))).toBe('forbidden');
  });

  it('resolves unauthenticated state for 401 API failures', () => {
    expect(getProtectedRouteErrorState(new ApiClientError('Unauthorized', 401))).toBe('unauthenticated');
  });
});
