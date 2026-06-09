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

import { AdminAssessmentBuilderPage } from './AdminAssessmentBuilderPage';
import { AdminAssignmentCompletionPage } from './AdminAssignmentCompletionPage';
import { AdminCourseBuilderPage } from './AdminCourseBuilderPage';
import { AdminDashboardPage } from './AdminDashboardPage';
import { AdminLessonsPage } from './AdminLessonsPage';
import { AdminMaterialsPage } from './AdminMaterialsPage';
import { AdminResultsCertificatesPage } from './AdminResultsCertificatesPage';
import { AdminUsersPage } from './AdminUsersPage';

function useLoadingState() {
  reactMocks.useState.mockImplementation((initialState: unknown) => [initialState, vi.fn()]);
}

function useFirstCallReadyState(value: unknown) {
  let callCount = 0;
  reactMocks.useState.mockImplementation((initialState: unknown) => {
    callCount++;
    return [callCount === 1 ? value : initialState, vi.fn()];
  });
}

afterEach(() => {
  reactMocks.useEffect.mockReset();
  reactMocks.useState.mockReset();
});

const ts = '2026-01-01T00:00:00.000Z';

const currentUser = {
  id: 'user-1',
  organizationId: 'org-1',
  email: 'admin@demo.com',
  firstName: 'Admin',
  lastName: 'User',
  middleName: null as null,
  position: null as null,
  shift: null as null,
  phone: null as null,
  status: 'active',
  locale: 'en',
  timezone: 'UTC',
  roles: ['admin'] as ['admin'],
};

const course = { id: 'course-1', organizationId: 'org-1', title: 'Workplace Safety', slug: 'workplace-safety', description: null as null, status: 'published' };
const lesson = { id: 'lesson-1', title: 'Fire Safety Basics', slug: 'fire-safety-basics', description: null as null, order: 1, status: 'published' };

describe('admin page smoke rendering', () => {
  it('renders dashboard loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminDashboardPage />);

    expect(html).toContain('admin-state');
  });

  it('renders dashboard authenticated state without crashing', () => {
    useFirstCallReadyState({ status: 'authenticated', user: currentUser });

    const html = renderToStaticMarkup(<AdminDashboardPage />);

    expect(html).toContain('href="/admin/users"');
  });

  it('renders users loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminUsersPage />);

    expect(html).toContain('role="status"');
  });

  it('renders users happy path without crashing', () => {
    useFirstCallReadyState({
      status: 'loaded',
      currentUser,
      users: [
        {
          id: 'user-1',
          organizationId: 'org-1',
          email: 'admin@demo.com',
          firstName: 'Admin',
          lastName: 'User',
          middleName: null,
          position: null,
          shift: null,
          phone: null,
          status: 'active',
          locale: 'en',
          timezone: 'UTC',
          lastLoginAt: null,
          createdAt: ts,
          updatedAt: ts,
          memberships: [{ role: 'admin' as const }],
        },
      ],
    });

    const html = renderToStaticMarkup(<AdminUsersPage />);

    expect(html).toContain('admin@demo.com');
  });

  it('renders course builder loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminCourseBuilderPage />);

    expect(html).toContain('role="status"');
  });

  it('renders course builder happy path without crashing', () => {
    useFirstCallReadyState({
      status: 'loaded',
      currentUser,
      course: {
        id: 'course-1',
        organizationId: 'org-1',
        title: 'Workplace Safety',
        slug: 'workplace-safety',
        description: null,
        status: 'published',
        createdAt: ts,
        updatedAt: ts,
        _count: { lessons: 3 },
      },
      lessons: [],
    });

    const html = renderToStaticMarkup(<AdminCourseBuilderPage />);

    expect(html).toContain('Workplace Safety');
  });

  it('renders lessons page loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminLessonsPage />);

    expect(html).toContain('role="status"');
  });

  it('renders lessons page happy path without crashing', () => {
    useFirstCallReadyState({
      status: 'loaded',
      courses: [course],
      lessons: [lesson],
    });

    const html = renderToStaticMarkup(<AdminLessonsPage />);

    expect(html).toContain('Fire Safety Basics');
  });

  it('renders materials page loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminMaterialsPage />);

    expect(html).toContain('role="status"');
  });

  it('renders materials page happy path without crashing', () => {
    useFirstCallReadyState({
      status: 'loaded',
      courses: [course],
      lessons: [lesson],
      materials: [
        {
          id: 'material-1',
          title: 'Safety Handbook',
          slug: 'safety-handbook',
          description: null,
          kind: 'link' as const,
          fileName: null,
          fileUrl: 'https://example.com/handbook.pdf',
          mimeType: null,
          sizeBytes: null,
          status: 'active',
        },
      ],
    });

    const html = renderToStaticMarkup(<AdminMaterialsPage />);

    expect(html).toContain('Safety Handbook');
  });

  it('renders assessment builder loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminAssessmentBuilderPage />);

    expect(html).toContain('role="status"');
  });

  it('renders assessment builder happy path without crashing', () => {
    useFirstCallReadyState({
      status: 'loaded',
      courses: [course],
      lessons: [lesson],
      assessments: [
        {
          id: 'assessment-1',
          title: 'Safety Knowledge Test',
          slug: 'safety-knowledge-test',
          description: null,
          passingScore: 70,
          maxAttempts: 3,
          availableAfterCourseCompletion: false,
          status: 'published',
        },
      ],
    });

    const html = renderToStaticMarkup(<AdminAssessmentBuilderPage />);

    expect(html).toContain('Safety Knowledge Test');
  });

  it('renders results and certificates loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminResultsCertificatesPage />);

    expect(html).toContain('role="status"');
  });

  it('renders results and certificates happy path without crashing', () => {
    useFirstCallReadyState({
      status: 'loaded',
      courses: [{ id: 'course-1', organizationId: 'org-1', title: 'Workplace Safety' }],
      users: [{ id: 'user-1', email: 'learner@demo.com', name: 'Learner User' }],
      assessments: [{ id: 'assessment-1', courseId: 'course-1', title: 'Safety Test', passingScore: 70, status: 'published' }],
      progressItems: [],
      certificates: [
        {
          id: 'cert-1',
          courseId: 'course-1',
          userId: 'user-1',
          issuedAt: ts,
          status: 'issued',
        },
      ],
      assessmentResults: [
        {
          id: 'result-1',
          assessmentId: 'assessment-1',
          userId: 'user-1',
          score: 4,
          maxScore: 5,
          percentage: 80,
          passed: true,
        },
      ],
    });

    const html = renderToStaticMarkup(<AdminResultsCertificatesPage />);

    expect(html).toContain('Learner User');
  });

  it('renders assignment completion loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminAssignmentCompletionPage />);

    expect(html).toContain('role="status"');
  });

  it('renders assignment completion happy path without crashing', () => {
    useFirstCallReadyState({
      status: 'loaded',
      courses: [{ id: 'course-1', organizationId: 'org-1', title: 'Workplace Safety', status: 'published' }],
      users: [
        {
          id: 'user-1',
          email: 'learner@demo.com',
          firstName: 'Learner',
          lastName: 'User',
          middleName: null,
          status: 'active',
        },
      ],
      assignments: [
        {
          id: 'assignment-1',
          courseId: 'course-1',
          userId: 'user-1',
          groupId: null,
          status: 'assigned',
          dueAt: null,
        },
      ],
      progressItems: [],
    });

    const html = renderToStaticMarkup(<AdminAssignmentCompletionPage />);

    expect(html).toContain('Workplace Safety');
  });
});
