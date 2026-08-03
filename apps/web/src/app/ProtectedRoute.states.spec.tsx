import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactState = vi.hoisted(() => ({ value: 'loading' }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: vi.fn(),
    useState: vi.fn(() => [reactState.value, vi.fn()]),
  };
});

import { ProtectedRoute } from './ProtectedRoute.js';

function renderState(state: string) {
  reactState.value = state;
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/admin/users']}>
      <Routes>
        <Route path="/login" element={<p>Login destination</p>} />
        <Route path="/admin/users" element={(
          <ProtectedRoute protectedPathPrefixes={['/admin']}>
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
