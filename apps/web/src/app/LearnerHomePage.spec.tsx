import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../shared/session.js', () => ({ useSession: () => ({
  currentUser: { id: 'u1', organizationId: 'o1', email: 'alex@example.com', firstName: 'Alex', lastName: 'Learner', middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'ru', timezone: 'UTC', roles: ['learner'] },
  status: 'authenticated', refreshUser: vi.fn(),
}) }));

const loadedState = {
  status: 'loaded',
  data: {
    firstName: 'Alex',
    coursesCount: 3,
    pendingAssignmentsCount: 2,
    availableAssessmentsCount: 1,
    certificatesCount: 4,
    continueLearning: [
      { courseId: 'course-1', title: 'Основы безопасности', completedLessons: 2, totalLessons: 5 },
    ],
    upcomingDeadlines: [{ id: 'assignment-1', title: 'Курс по этике', dueAt: '2026-12-01T00:00:00.000Z' }],
    recentActivity: [{ key: 'lesson-1', date: '2026-01-01T00:00:00.000Z', message: 'Завершён урок «Введение»' }],
  },
};

const emptyState = {
  status: 'loaded',
  data: {
    firstName: 'Alex',
    coursesCount: 0,
    pendingAssignmentsCount: 0,
    availableAssessmentsCount: 0,
    certificatesCount: 0,
    continueLearning: [],
    upcomingDeadlines: [],
    recentActivity: [],
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

import { LearnerHomePage } from './LearnerHomePage';

afterEach(() => {
  reactMocks.useEffect.mockReset();
  reactMocks.useState.mockReset();
});

describe('LearnerHomePage', () => {
  it('renders stats, continue learning, deadlines, and activity', () => {
    reactMocks.useState.mockReturnValueOnce([loadedState, vi.fn()]);

    const html = renderToStaticMarkup(<LearnerHomePage />);

    expect(html).toContain('Основы безопасности');
    expect(html).toContain('Курс по этике');
    expect(html).toContain('Завершён урок «Введение»');
    expect(html).toContain('>3<');
    expect(html).toContain('>2<');
    expect(html.indexOf('Основы безопасности')).toBeLessThan(html.indexOf('>3<'));
  });

  it('highlights overdue work and keeps it in the action area', () => {
    reactMocks.useState.mockReturnValueOnce([{
      ...loadedState,
      data: {
        ...loadedState.data,
        upcomingDeadlines: [{
          id: 'assignment-overdue',
          title: 'Просроченное задание',
          dueAt: '2025-01-01T00:00:00.000Z',
          isOverdue: true,
        }],
      },
    }, vi.fn()]);

    const html = renderToStaticMarkup(<LearnerHomePage />);

    expect(html).toContain('learner-dashboard__deadline--overdue');
    expect(html).toContain('Просрочено с');
    expect(html).toContain('href="/learn/assignments/assignment-overdue"');
  });

  it('renders empty states when there is nothing to show', () => {
    reactMocks.useState.mockReturnValueOnce([emptyState, vi.fn()]);

    const html = renderToStaticMarkup(<LearnerHomePage />);

    expect(html).toContain('Пока нет начатых курсов.');
    expect(html).toContain('Нет предстоящих дедлайнов.');
    expect(html).toContain('Активности пока нет.');
  });
});
