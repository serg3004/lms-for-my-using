import '../i18n/index.js';

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

import { LearnerAssessmentsPage } from './LearnerAssessmentsPage';
import { LearnerAssignmentsPage } from './LearnerAssignmentsPage';
import { LearnerCoursesPage } from './LearnerCoursesPage';

function useLoadingState() {
  reactMocks.useState.mockImplementation((initialState: unknown) => [initialState, vi.fn()]);
}

function useReadyState(value: unknown) {
  reactMocks.useState.mockImplementationOnce(() => [value, vi.fn()]);
}

afterEach(() => {
  reactMocks.useEffect.mockReset();
  reactMocks.useState.mockReset();
});

describe('learner page smoke rendering', () => {
  it('renders courses loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<LearnerCoursesPage />);

    expect(html).toContain('role="status"');
  });

  it('renders courses happy path without crashing', () => {
    useReadyState({
      status: 'loaded',
      courses: [
        {
          id: 'course-1',
          organizationId: 'org-1',
          title: 'MVP Onboarding Course',
          slug: 'mvp-onboarding-course',
          description: 'Pilot course description',
          status: 'published',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const html = renderToStaticMarkup(<LearnerCoursesPage />);

    expect(html).toContain('MVP Onboarding Course');
    expect(html).toContain('href="/learn/courses/course-1"');
    expect(html).toContain('published');
  });

  it('renders assignments loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<LearnerAssignmentsPage />);

    expect(html).toContain('role="status"');
  });

  it('renders assignments happy path without crashing', () => {
    useReadyState({
      status: 'loaded',
      assignments: [
        {
          id: 'assignment-1',
          organizationId: 'org-1',
          courseId: 'course-1',
          userId: 'learner-1',
          groupId: null,
          status: 'assigned',
          dueAt: '2026-01-02T00:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          courseTitle: 'MVP Onboarding Course',
          userName: 'Learner One',
          groupName: null,
        },
      ],
    });

    const html = renderToStaticMarkup(<LearnerAssignmentsPage />);

    expect(html).toContain('href="/learn/assignments/assignment-1"');
    expect(html).toContain('MVP Onboarding Course');
    expect(html).toContain('Learner One');
  });

  it('renders assessments loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<LearnerAssessmentsPage />);

    expect(html).toContain('role="status"');
  });

  it('renders assessments happy path without crashing', () => {
    useReadyState({
      status: 'loaded',
      assessments: [
        {
          id: 'assessment-1',
          organizationId: 'org-1',
          courseId: 'course-1',
          lessonId: 'lesson-1',
          title: 'MVP Quiz',
          slug: 'mvp-quiz',
          description: 'Check MVP understanding',
          status: 'published',
          passingScore: 70,
          maxAttempts: 3,
          availableAfterCourseCompletion: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          courseTitle: 'MVP Onboarding Course',
        },
      ],
    });

    const html = renderToStaticMarkup(<LearnerAssessmentsPage />);

    expect(html).toContain('MVP Quiz');
    expect(html).toContain('href="/learn/assessments/assessment-1"');
    expect(html).toContain('70');
  });
});
