import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactMocks = vi.hoisted(() => ({
  useEffect: vi.fn(),
  useState: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    useEffect: reactMocks.useEffect,
    useState: reactMocks.useState,
  };
});

import { AdminUsersPage } from './AdminUsersPage';

const ts = '2026-01-01T00:00:00.000Z';

const user = {
  id: 'user-1',
  organizationId: 'org-1',
  email: 'admin@demo.com',
  firstName: 'Admin',
  lastName: 'User',
  middleName: null,
  position: 'Instructor',
  shift: 'Day',
  phone: '+77001234567',
  status: 'active',
  locale: 'en',
  timezone: 'UTC',
  lastLoginAt: null,
  createdAt: ts,
  updatedAt: ts,
  memberships: [{ role: 'admin' }],
};

const pageState = {
  status: 'loaded',
  currentUser: user,
  users: [user],
};

const emptyForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  middleName: '',
  position: '',
  shift: '',
  phone: '',
  status: 'active',
  locale: 'ru',
  timezone: 'Asia/Almaty',
  role: '',
};

afterEach(() => {
  reactMocks.useEffect.mockReset();
  reactMocks.useState.mockReset();
});

function useAdminUsersState(form: unknown, mode: 'create' | 'edit', validationErrors: Record<string, string> = {}) {
  const setter = vi.fn();
  reactMocks.useState
    .mockReturnValueOnce([pageState, setter])   // AdminUsersPage: pageState
    .mockReturnValueOnce([form, setter])        // AdminUsersPage: form
    .mockReturnValueOnce([mode, setter])        // AdminUsersPage: mode
    .mockReturnValueOnce([null, setter])        // AdminUsersPage: error
    .mockReturnValueOnce([false, setter])       // AdminUsersPage: isSaving
    .mockReturnValueOnce([validationErrors, setter]) // AdminUsersPage: validationErrors
    .mockReturnValueOnce([false, setter]);      // AdminPageLayout: isOpen
}

describe('AdminUsersPage CRUD form modes', () => {
  it('renders create form', () => {
    useAdminUsersState(emptyForm, 'create');

    const html = renderToStaticMarkup(<AdminUsersPage />);

    expect(html).toContain('Create user');
    expect(html).toContain('Password *');
  });

  it('renders field-level validation errors when validationErrors state has errors', () => {
    useAdminUsersState(emptyForm, 'create', { firstName: 'First name is required', email: 'Email is required' });

    const html = renderToStaticMarkup(<AdminUsersPage />);

    expect(html).toContain('First name is required');
    expect(html).toContain('Email is required');
  });

  it('renders edit form with additional profile fields', () => {
    useAdminUsersState(
      {
        ...emptyForm,
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        position: user.position,
        shift: user.shift,
        phone: user.phone,
        status: user.status,
        locale: user.locale,
        timezone: user.timezone,
        role: 'admin',
      },
      'edit',
    );

    const html = renderToStaticMarkup(<AdminUsersPage />);

    expect(html).toContain('Edit user');
    expect(html).toContain('Position');
    expect(html).toContain('Timezone');
  });
});
