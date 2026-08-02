import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadedState = {
  status: 'loaded',
  data: {
    period: 30,
    overallProgressPercent: 75,
    lessonsCompletedCount: 3,
    activeDaysCount: 2,
    avgAssessmentScore: 80,
    courses: [
      {
        courseId: 'course-a',
        title: 'Course A',
        completedLessons: 2,
        totalLessons: 2,
        percentage: 100,
        status: 'completed',
        latestAssessmentScore: 80,
      },
      {
        courseId: 'course-b',
        title: 'Course B',
        completedLessons: 1,
        totalLessons: 2,
        percentage: 50,
        status: 'in_progress',
        latestAssessmentScore: null,
      },
    ],
    weeklyGoal: { completed: 2, target: 3 },
    streak: [
      { dayOfWeek: 0, date: '2026-01-05', active: true },
      { dayOfWeek: 1, date: '2026-01-06', active: true },
      { dayOfWeek: 2, date: '2026-01-07', active: false },
      { dayOfWeek: 3, date: '2026-01-08', active: false },
      { dayOfWeek: 4, date: '2026-01-09', active: false },
      { dayOfWeek: 5, date: '2026-01-10', active: false },
      { dayOfWeek: 6, date: '2026-01-11', active: false },
    ],
    recentActivity: [
      { type: 'lesson_completed', courseId: 'course-a', courseTitle: 'Course A', date: '2026-01-02T00:00:00.000Z' },
      { type: 'assessment_passed', courseId: 'course-a', courseTitle: 'Course A', score: 80, date: '2026-01-01T00:00:00.000Z' },
    ],
  },
};

const emptyState = {
  status: 'loaded',
  data: {
    period: 30,
    overallProgressPercent: 0,
    lessonsCompletedCount: 0,
    activeDaysCount: 0,
    avgAssessmentScore: null,
    courses: [],
    weeklyGoal: { completed: 0, target: 3 },
    streak: [
      { dayOfWeek: 0, date: '2026-01-05', active: false },
      { dayOfWeek: 1, date: '2026-01-06', active: false },
      { dayOfWeek: 2, date: '2026-01-07', active: false },
      { dayOfWeek: 3, date: '2026-01-08', active: false },
      { dayOfWeek: 4, date: '2026-01-09', active: false },
      { dayOfWeek: 5, date: '2026-01-10', active: false },
      { dayOfWeek: 6, date: '2026-01-11', active: false },
    ],
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

import { LearnerProgressPage } from './LearnerProgressPage';

afterEach(() => {
  reactMocks.useEffect.mockReset();
  reactMocks.useState.mockReset();
});

describe('LearnerProgressPage', () => {
  it('renders stats, courses, weekly goal, streak, and activity', () => {
    reactMocks.useState.mockReturnValueOnce([loadedState, vi.fn()]).mockReturnValueOnce([30, vi.fn()]);

    const html = renderToStaticMarkup(<LearnerProgressPage />);

    expect(html).toContain('75%');
    expect(html).toContain('Course A');
    expect(html).toContain('Course B');
    expect(html).toContain('2/3');
    expect(html).toContain('Осталось уроков до цели: 1');
  });

  it('renders empty states when there is no course or activity data', () => {
    reactMocks.useState.mockReturnValueOnce([emptyState, vi.fn()]).mockReturnValueOnce([30, vi.fn()]);

    const html = renderToStaticMarkup(<LearnerProgressPage />);

    expect(html).toContain('Вы ещё не начали ни одного курса.');
    expect(html).toContain('Нет активности за выбранный период.');
  });
});
