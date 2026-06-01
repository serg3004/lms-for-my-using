import { describe, expect, it } from 'vitest';

import { getRootNavigationItems } from './App';

describe('getRootNavigationItems', () => {
  it('shows only login navigation before authentication is known', () => {
    expect(getRootNavigationItems(null)).toEqual([{ labelKey: 'login.navLink', href: '/login' }]);
  });

  it('shows learner navigation for learner-only users', () => {
    const items = getRootNavigationItems({ roles: ['learner'] });

    expect(items.map((item) => item.href)).toEqual([
      '/learn',
      '/learn/courses',
      '/learn/progress',
      '/learn/assignments',
      '/learn/assessments',
      '/learn/certificates',
    ]);
  });

  it('shows admin navigation for privileged users', () => {
    const items = getRootNavigationItems({ roles: ['learner', 'admin'] });

    expect(items[0]).toEqual({ labelKey: 'admin.navLink', fallbackLabel: 'Admin', href: '/admin' });
  });
});
