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

import { LearnerAssessmentDetailPage } from './LearnerAssessmentDetailPage';
import { LearnerAssessmentsPage } from './LearnerAssessmentsPage';
import { LearnerAssessmentTakingPage } from './LearnerAssessmentTakingPage';
import { LearnerAssignmentsPage } from './LearnerAssignmentsPage';
import { LearnerCertificateDetailPage } from './LearnerCertificateDetailPage';
import { LearnerCertificatesPage } from './LearnerCertificatesPage';
import { LearnerCourseDetailPage } from './LearnerCourseDetailPage';
import { LearnerCoursesPage } from './LearnerCoursesPage';
import { LearnerLessonDetailPage } from './LearnerLessonDetailPage';
import { LearnerLessonMaterialsPage } from './LearnerLessonMaterialsPage';
import { LearnerLessonsPage } from './LearnerLessonsPage';
import { LearnerProgressPage } from './LearnerProgressPage';

function isIdleLoadState(value: unknown) {
  return typeof value === 'object' && value !== null && 'status' in value && value.status === 'idle';
}

function useLoadingState() {
  reactMocks.useState.mockImplementation((initialState: unknown) => [
    typeof initialState === 'function' ? (initialState as () => unknown)() : initialState,
    vi.fn(),
  ]);
}

function useReadyState(value: unknown) {
  reactMocks.useState.mockImplementation((initialState: unknown) => {
    const resolvedInitial = typeof initialState === 'function' ? (initialState as () => unknown)() : initialState;
    return [isIdleLoadState(resolvedInitial) ? value : resolvedInitial, vi.fn()];
  });
}

afterEach(() => {
  reactMocks.useEffect.mockReset();
  reactMocks.useState.mockReset();
});

describe('learner page smoke rendering', () => {
  it('renders lesson materials loading and loaded states', () => {
    useLoadingState();
    expect(renderToStaticMarkup(<LearnerLessonMaterialsPage lessonId="lesson-1" />)).toContain('role="status"');

    useReadyState({
      status: 'loaded',
      lesson: {
        id: 'lesson-1', organizationId: 'org-1', courseId: 'course-1', title: 'Fire safety', slug: 'fire-safety', description: null, order: 1, status: 'published', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
      materials: [{
        id: 'material-1', organizationId: 'org-1', courseId: 'course-1', lessonId: 'lesson-1', title: 'Checklist', slug: 'checklist', description: 'Inspection steps', kind: 'file', fileName: 'checklist.pdf', fileUrl: '/file.pdf', mimeType: 'application/pdf', sizeBytes: 100, status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    });
    expect(renderToStaticMarkup(<LearnerLessonMaterialsPage lessonId="lesson-1" />)).toContain('Checklist');
  });
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
    expect(html).toContain('В процессе');
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
      rows: [
        {
          assessment: {
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
          },
          courseTitle: 'MVP Onboarding Course',
          questionCount: 5,
          attemptsUsed: 0,
          bestPercentage: null,
          completed: false,
        },
      ],
    });

    const html = renderToStaticMarkup(<LearnerAssessmentsPage />);

    expect(html).toContain('MVP Quiz');
    expect(html).toContain('href="/learn/assessments/assessment-1"');
    expect(html).toContain('70');
  });

  it('renders certificates loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<LearnerCertificatesPage />);

    expect(html).toContain('role="status"');
  });

  it('renders certificates happy path without crashing', () => {
    useReadyState({
      status: 'loaded',
      certificates: [
        {
          id: 'cert-1',
          organizationId: 'org-1',
          courseId: 'course-1',
          userId: 'user-1',
          assessmentAttemptId: null,
          status: 'issued',
          issuedAt: '2026-01-01T00:00:00.000Z',
          revokedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          course: { id: 'course-1', title: 'Safety Course' },
        },
      ],
    });

    const html = renderToStaticMarkup(<LearnerCertificatesPage />);

    expect(html).toContain('href="/learn/certificates/cert-1"');
    expect(html).toContain('Safety Course');
  });

  it('renders course detail loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<LearnerCourseDetailPage courseId="course-1" />);

    expect(html).toContain('role="status"');
  });

  it('renders course detail happy path without crashing', () => {
    useReadyState({
      status: 'loaded',
      course: {
        id: 'course-1',
        organizationId: 'org-1',
        title: 'Workplace Safety',
        slug: 'workplace-safety',
        description: 'Safety course',
        status: 'published',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      lessons: [
        {
          id: 'lesson-1',
          organizationId: 'org-1',
          courseId: 'course-1',
          title: 'Introduction to Safety',
          slug: 'intro-safety',
          description: null,
          order: 1,
          status: 'published',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'lesson-2',
          organizationId: 'org-1',
          courseId: 'course-1',
          title: 'Fire Safety Basics',
          slug: 'fire-safety-basics',
          description: null,
          order: 2,
          status: 'published',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'lesson-3',
          organizationId: 'org-1',
          courseId: 'course-1',
          title: 'Assessment',
          slug: 'assessment',
          description: null,
          order: 3,
          status: 'published',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      completedLessonIds: new Set(['lesson-1']),
      dueAt: null,
    });

    const html = renderToStaticMarkup(<LearnerCourseDetailPage courseId="course-1" />);

    expect(html).toContain('Workplace Safety');
    expect(html).toContain('href="/learn/lessons/lesson-2"');
  });

  it('renders lessons loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<LearnerLessonsPage courseId="course-1" />);

    expect(html).toContain('role="status"');
  });

  it('renders lessons happy path without crashing', () => {
    useReadyState({
      status: 'loaded',
      lessons: [
        {
          id: 'lesson-1',
          organizationId: 'org-1',
          courseId: 'course-1',
          title: 'Introduction to Safety',
          slug: 'intro-safety',
          description: null,
          order: 1,
          status: 'published',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      completedIds: new Set<string>(['lesson-1']),
    });

    const html = renderToStaticMarkup(<LearnerLessonsPage courseId="course-1" />);

    expect(html).toContain('Introduction to Safety');
  });

  it('renders lesson detail loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<LearnerLessonDetailPage lessonId="lesson-1" />);

    expect(html).toContain('role="status"');
  });

  it('renders lesson detail happy path without crashing', () => {
    useReadyState({
      status: 'loaded',
      lesson: {
        id: 'lesson-1',
        organizationId: 'org-1',
        courseId: 'course-1',
        title: 'Fire Safety Basics',
        slug: 'fire-safety-basics',
        description: 'Learn fire safety',
        order: 1,
        status: 'published',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      course: {
        id: 'course-1',
        organizationId: 'org-1',
        title: 'Workplace Safety',
        slug: 'workplace-safety',
        description: null,
        status: 'published',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        _count: { lessons: 1 },
      },
      allLessons: [
        {
          id: 'lesson-1',
          organizationId: 'org-1',
          courseId: 'course-1',
          title: 'Fire Safety Basics',
          slug: 'fire-safety-basics',
          description: 'Learn fire safety',
          order: 1,
          status: 'published',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      materials: [],
      completedIds: new Set(),
    });

    const html = renderToStaticMarkup(<LearnerLessonDetailPage lessonId="lesson-1" />);

    expect(html).toContain('Fire Safety Basics');
  });

  it('renders assessment detail loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<LearnerAssessmentDetailPage assessmentId="assessment-1" />);

    expect(html).toContain('role="status"');
  });

  it('renders assessment detail happy path without crashing', () => {
    useReadyState({
      status: 'loaded',
      assessment: {
        id: 'assessment-1',
        organizationId: 'org-1',
        courseId: 'course-1',
        lessonId: null,
        title: 'Safety Knowledge Test',
        slug: 'safety-knowledge-test',
        description: null,
        status: 'published',
        passingScore: 70,
        maxAttempts: 3,
        availableAfterCourseCompletion: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        course: { id: 'course-1', title: 'Workplace Safety' },
      },
    });

    const html = renderToStaticMarkup(<LearnerAssessmentDetailPage assessmentId="assessment-1" />);

    expect(html).toContain('Safety Knowledge Test');
    expect(html).toContain('70');
  });

  it('renders assessment taking loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<LearnerAssessmentTakingPage assessmentId="assessment-1" />);

    expect(html).toContain('role="status"');
  });

  it('renders assessment taking happy path without crashing', () => {
    const loadedAssessment = {
      status: 'loaded',
      assessment: {
        id: 'assessment-1',
        organizationId: 'org-1',
        courseId: 'course-1',
        lessonId: null,
        title: 'Safety Knowledge Test',
        slug: 'safety-knowledge-test',
        description: null,
        status: 'published',
        passingScore: 70,
        maxAttempts: 3,
        availableAfterCourseCompletion: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      questions: [
        {
          id: 'q-1',
          type: 'single_choice',
          title: 'What is the primary safety rule?',
          text: null,
          points: 1,
          order: 1,
          options: [
            { id: 'opt-1', questionId: 'q-1', text: 'Always wear PPE', imageUrl: null, order: 1 },
            { id: 'opt-2', questionId: 'q-1', text: 'Run when in doubt', imageUrl: null, order: 2 },
          ],
        },
      ],
    };

    reactMocks.useState.mockImplementation((initialState: unknown) => {
      if (
        typeof initialState === 'object' &&
        initialState !== null &&
        'status' in initialState &&
        (initialState as { status: string }).status === 'loading'
      ) {
        return [loadedAssessment, vi.fn()];
      }
      if (initialState === null) {
        return [900, vi.fn()]; // secondsLeft — renders timer and covers formatTime
      }
      return [typeof initialState === 'function' ? (initialState as () => unknown)() : initialState, vi.fn()];
    });

    const html = renderToStaticMarkup(<LearnerAssessmentTakingPage assessmentId="assessment-1" />);

    expect(html).toContain('Safety Knowledge Test');
    expect(html).toContain('What is the primary safety rule?');
    expect(html).toContain('15:00'); // formatTime(900)
  });

  it('renders certificate detail loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<LearnerCertificateDetailPage certificateId="cert-1" />);

    expect(html).toContain('role="status"');
  });

  it('renders certificate detail happy path without crashing', () => {
    useReadyState({
      status: 'loaded',
      certificate: {
        id: 'cert-1',
        organizationId: 'org-1',
        courseId: 'course-1',
        userId: 'user-1',
        assessmentAttemptId: null,
        status: 'issued',
        issuedAt: '2026-01-01T00:00:00.000Z',
        revokedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        course: { id: 'course-1', title: 'Workplace Safety' },
      },
    });

    const html = renderToStaticMarkup(<LearnerCertificateDetailPage certificateId="cert-1" />);

    expect(html).toContain('Workplace Safety');
  });

  it('renders progress loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<LearnerProgressPage />);

    expect(html).toContain('role="status"');
  });

  it('renders progress happy path without crashing', () => {
    useReadyState({
      status: 'loaded',
      data: {
        period: 30,
        overallProgressPercent: 72,
        lessonsCompletedCount: 5,
        activeDaysCount: 3,
        avgAssessmentScore: 84,
        courses: [
          {
            courseId: 'course-1',
            title: 'Workplace Safety',
            completedLessons: 7,
            totalLessons: 10,
            percentage: 70,
            status: 'in_progress',
            latestAssessmentScore: 84,
          },
        ],
        weeklyGoal: { completed: 2, target: 3 },
        streak: [
          { dayOfWeek: 0, date: '2026-01-05', active: true },
          { dayOfWeek: 1, date: '2026-01-06', active: false },
          { dayOfWeek: 2, date: '2026-01-07', active: false },
          { dayOfWeek: 3, date: '2026-01-08', active: false },
          { dayOfWeek: 4, date: '2026-01-09', active: false },
          { dayOfWeek: 5, date: '2026-01-10', active: false },
          { dayOfWeek: 6, date: '2026-01-11', active: false },
        ],
        recentActivity: [
          { type: 'lesson_completed', courseId: 'course-1', courseTitle: 'Workplace Safety', date: '2026-01-02T00:00:00.000Z' },
        ],
      },
    });

    const html = renderToStaticMarkup(<LearnerProgressPage />);

    expect(html).toContain('Workplace Safety');
  });
});
