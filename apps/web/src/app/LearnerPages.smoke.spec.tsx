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
import { LearnerLessonsPage } from './LearnerLessonsPage';
import { LearnerProgressPage } from './LearnerProgressPage';

function isIdleLoadState(value: unknown) {
  return typeof value === 'object' && value !== null && 'status' in value && value.status === 'idle';
}

function useLoadingState() {
  reactMocks.useState.mockImplementation((initialState: unknown) => [initialState, vi.fn()]);
}

function useReadyState(value: unknown) {
  reactMocks.useState.mockImplementation((initialState: unknown) => [isIdleLoadState(initialState) ? value : initialState, vi.fn()]);
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
      totalLessons: 3,
      completedLessons: 1,
    });

    const html = renderToStaticMarkup(<LearnerCourseDetailPage courseId="course-1" />);

    expect(html).toContain('Workplace Safety');
    expect(html).toContain('href="/learn/courses/course-1/lessons"');
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
      materials: [],
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
      progress: [
        {
          id: 'progress-1',
          organizationId: 'org-1',
          courseId: 'course-1',
          lessonId: 'lesson-1',
          userId: 'user-1',
          status: 'completed',
          score: null,
          completedAt: '2026-01-02T00:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          course: { id: 'course-1', title: 'Workplace Safety' },
          lesson: { id: 'lesson-1', title: 'Fire Safety Basics' },
        },
      ],
    });

    const html = renderToStaticMarkup(<LearnerProgressPage />);

    expect(html).toContain('Workplace Safety');
  });
});
