import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AccountSwitcher, getActiveRole, getAvailableRoles } from './accountSwitcher.js';

describe('getActiveRole', () => {
  it('detects the admin workspace', () => {
    expect(getActiveRole('/admin')).toBe('admin');
    expect(getActiveRole('/admin/courses')).toBe('admin');
  });

  it('detects the instructor workspace', () => {
    expect(getActiveRole('/instructor/dashboard')).toBe('instructor');
  });

  it('detects the manager workspace', () => {
    expect(getActiveRole('/manager/team')).toBe('manager');
  });

  it('detects the learner workspace', () => {
    expect(getActiveRole('/learn/courses')).toBe('learner');
  });

  it('returns null for unrelated paths', () => {
    expect(getActiveRole('/login')).toBeNull();
  });
});

describe('getAvailableRoles', () => {
  it('always includes the learner workspace', () => {
    expect(getAvailableRoles(['admin'])).toEqual(['admin', 'learner']);
  });

  it('lists every role the user holds in a fixed order', () => {
    expect(getAvailableRoles(['manager', 'admin'])).toEqual(['admin', 'manager', 'learner']);
  });

  it('does not duplicate learner when the user already has it', () => {
    expect(getAvailableRoles(['learner'])).toEqual(['learner']);
  });
});

describe('AccountSwitcher', () => {
  it('renders nothing before the current user has loaded', () => {
    const html = renderToStaticMarkup(<AccountSwitcher />);
    expect(html).toBe('');
  });
});
