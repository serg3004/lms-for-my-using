import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../shared/apiClient.js', () => ({ updateCurrentUserPreferences: vi.fn() }));
vi.mock('../shared/session.js', () => ({ useSession: () => ({
  currentUser: { id: 'u1', organizationId: 'o1', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', middleName: null, position: 'Learner', shift: null, phone: null, status: 'active', locale: 'ru', timezone: 'UTC', roles: ['learner'] },
  status: 'authenticated', refreshUser: vi.fn(),
}) }));

import { LearnerProfilePage } from './LearnerProfilePage.js';

describe('LearnerProfilePage', () => {
  it('renders identity as read-only content', () => {
    const html = renderToStaticMarkup(<LearnerProfilePage />);
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('ada@example.com');
    expect(html).not.toContain('name="firstName"');
  });

  it('offers all four supported locales', () => {
    const html = renderToStaticMarkup(<LearnerProfilePage />);
    for (const locale of ['ru', 'en', 'kk', 'zh']) expect(html).toContain(`value="${locale}"`);
  });
});
