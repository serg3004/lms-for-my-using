import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadedState = {
  status: 'loaded',
  data: {
    user: {
      id: 'manager-1',
      organizationId: 'org-1',
      email: 'manager@demo.com',
      firstName: 'Нур',
      lastName: 'Ахметов',
      roles: ['manager'],
    },
    summary: {
      membersCount: 2,
      completionRate: 72,
      dueThisWeekCount: 5,
      overdueCount: 2,
      avgTeamScore: 84,
      upcomingDeadlines: [
        { courseTitle: 'Техника безопасности', userId: 'user-1', dueAt: '2026-08-05T00:00:00.000Z' },
      ],
      members: [
        { userId: 'user-1', firstName: 'Алексей', lastName: 'Смирнов', email: 'a@demo.com', activeCoursesCount: 2, completionPercent: 84, status: 'good' },
      ],
    },
  },
};

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

import { ManagerDashboardPage } from './ManagerDashboardPage';

afterEach(() => {
  reactMocks.useEffect.mockReset();
  reactMocks.useState.mockReset();
});

describe('ManagerDashboardPage', () => {
  it('renders team stats, upcoming deadlines, and average score', () => {
    reactMocks.useState
      .mockReturnValueOnce([loadedState, vi.fn()])
      .mockReturnValueOnce([false, vi.fn()])
      .mockReturnValueOnce([false, vi.fn()])
      .mockImplementation((initial: unknown) => [initial, vi.fn()]);

    const html = renderToStaticMarkup(<ManagerDashboardPage />);

    expect(html).toContain('72%');
    expect(html).toContain('Техника безопасности');
    expect(html).toContain('Средний балл команды — 84%');
  });
});
