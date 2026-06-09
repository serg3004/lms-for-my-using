import { describe, expect, it } from 'vitest';

import { getRootNavigationItems } from './App';

describe('getRootNavigationItems', () => {
  it('shows only login navigation before authentication is known', () => {
    expect(getRootNavigationItems(null)).toEqual([{ labelKey: 'login.navLink', href: '/login' }]);
  });

  it('shows learner navigation without admin links for learner-only users', () => {
    const items = getRootNavigationItems({ roles: ['learner'] });

    expect(items.map((item) => item.href)).toEqual([
      '/learn',
      '/learn/courses',
      '/learn/progress',
      '/learn/assignments',
      '/learn/assessments',
      '/learn/certificates',
    ]);
    expect(items.some((item) => item.href === '/admin')).toBe(false);
  });

  it.each([
    ['admin'],
    ['manager'],
    ['instructor'],
  ] as const)('shows admin navigation for %s users', (role) => {
    const items = getRootNavigationItems({ roles: [role] });

    expect(items[0]).toEqual({ labelKey: 'admin.navLink', fallbackLabel: 'Admin', href: '/admin' });
  });

  it('keeps learner navigation visible for privileged users with learner access', () => {
    const items = getRootNavigationItems({ roles: ['learner', 'admin'] });

    expect(items.map((item) => item.href)).toEqual([
      '/admin',
      '/learn',
      '/learn/courses',
      '/learn/progress',
      '/learn/assignments',
      '/learn/assessments',
      '/learn/certificates',
    ]);
  });
});
