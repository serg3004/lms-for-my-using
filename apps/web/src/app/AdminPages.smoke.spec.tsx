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
import { AdminChecklistsPage, filterChecklists } from './AdminChecklistsPage';
import { AdminCourseBuilderPage } from './AdminCourseBuilderPage';
import { AdminCoursesPage } from './AdminCoursesPage';
import { AdminDashboardPage } from './AdminDashboardPage';
import { AdminLessonsPage } from './AdminLessonsPage';
import { AdminMaterialsPage } from './AdminMaterialsPage';
import { AdminOrgStructurePage } from './AdminOrgStructurePage';
import { AdminResultsCertificatesPage } from './AdminResultsCertificatesPage';
import { AdminRolesPage } from './AdminRolesPage';
import { AdminThemeSettingsPage } from './AdminThemeSettingsPage';
import { AdminUsersPage } from './AdminUsersPage';

function useLoadingState() {
  reactMocks.useState.mockImplementation((initialState: unknown) => [
    typeof initialState === 'function' ? (initialState as () => unknown)() : initialState,
    vi.fn(),
  ]);
}

function useFirstCallReadyState(value: unknown) {
  let callCount = 0;
  reactMocks.useState.mockImplementation((initialState: unknown) => {
    callCount++;
    const resolvedInitial = typeof initialState === 'function' ? (initialState as () => unknown)() : initialState;
    return [callCount === 1 ? value : resolvedInitial, vi.fn()];
  });
}

function useStateAtCalls(overrides: Record<number, unknown>) {
  let callCount = 0;
  reactMocks.useState.mockImplementation((initialState: unknown) => {
    callCount++;
    const resolvedInitial = typeof initialState === 'function' ? (initialState as () => unknown)() : initialState;
    return [callCount in overrides ? overrides[callCount] : resolvedInitial, vi.fn()];
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
const lesson = { id: 'lesson-1', title: 'Fire Safety Basics', slug: 'fire-safety-basics', description: null as null, type: 'text' as const, order: 1, status: 'published' };

describe('admin page smoke rendering', () => {
  it('renders courses loading and loaded table states', () => {
    useLoadingState();
    expect(renderToStaticMarkup(<AdminCoursesPage />)).toContain('role="status"');

    useFirstCallReadyState({
      status: 'loaded', currentUser, total: 1, pageSize: 20,
      courses: [{ ...course, createdAt: ts, updatedAt: ts, _count: { lessons: 2 } }],
    });
    expect(renderToStaticMarkup(<AdminCoursesPage />)).toContain('Workplace Safety');
  });

  it('renders organization structure loading and populated states', () => {
    useLoadingState();
    expect(renderToStaticMarkup(<AdminOrgStructurePage />)).toContain('role="status"');

    useFirstCallReadyState({
      status: 'loaded',
      organizationId: 'org-1',
      employeeCount: 1,
      groups: [{
        id: 'group-1',
        organizationId: 'org-1',
        name: 'Safety',
        slug: 'safety',
        description: null,
        location: 'Almaty',
        status: 'active',
        _count: { members: 3 },
        managers: [{ manager: { id: 'user-1', firstName: 'Admin', lastName: 'User' } }],
      }],
    });
    expect(renderToStaticMarkup(<AdminOrgStructurePage />)).toContain('Safety');
  });

  it('renders roles loading and populated states', () => {
    useLoadingState();
    expect(renderToStaticMarkup(<AdminRolesPage />)).toContain('role="status"');

    useFirstCallReadyState({
      status: 'loaded',
      users: [{ id: 'user-1', organizationId: 'org-1', email: 'admin@demo.com', firstName: 'Admin', lastName: 'User', middleName: null, status: 'active' }],
      memberships: [{ id: 'membership-1', organizationId: 'org-1', userId: 'user-1', role: 'admin', assignedBy: null, createdAt: ts }],
    });
    expect(renderToStaticMarkup(<AdminRolesPage />)).toContain('admin@demo.com');
  });

  it('renders every theme settings group', () => {
    useLoadingState();
    const html = renderToStaticMarkup(<AdminThemeSettingsPage />);
    expect(html).toContain('Основной цвет');
    expect(html).toContain('Отступы страницы');
    expect(html).toContain('Фон сайдбара');
  });
  it('renders dashboard loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminDashboardPage />);

    expect(html).toContain('admin-state');
  });

  it('renders dashboard authenticated state without crashing', () => {
    useFirstCallReadyState({
      status: 'authenticated',
      user: currentUser,
      stats: {
        usersTotal: 4,
        coursesTotal: 2,
        completionRate: 50,
        certificatesTotal: 1,
        pendingActivationCount: 1,
        systemAvailable: true,
        activity: [{ key: 'user-1', date: ts, message: 'New user added: Admin User' }],
      },
    });

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
      lessons: [{ ...lesson, course: { title: course.title } }],
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
        {
          id: 'assessment-2',
          title: 'Draft Quiz',
          slug: 'draft-quiz',
          description: null,
          passingScore: 70,
          maxAttempts: 3,
          availableAfterCourseCompletion: false,
          status: 'draft',
        },
      ],
    });

    const html = renderToStaticMarkup(<AdminAssessmentBuilderPage />);

    expect(html).toContain('Safety Knowledge Test');
    expect(html).toContain('Draft Quiz');
    expect(html).toContain('disabled=""');
  });

  it('renders checklists loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminChecklistsPage />);

    expect(html).toContain('role="status"');
  });

  it('renders checklists happy path without crashing', () => {
    useFirstCallReadyState({
      status: 'loaded',
      currentUser,
      checklists: [
        {
          id: 'checklist-1',
          organizationId: 'org-1',
          title: 'Приёмка нового стажёра',
          description: null,
          status: 'published',
          scoringMode: 'sum_points',
          passThreshold: 80,
          scaleLevels: null,
          requiresReview: false,
          createdBy: 'user-1',
          createdAt: ts,
          updatedAt: ts,
          items: [
            { id: 'item-1', checklistId: 'checklist-1', order: 0, text: 'Получил СИЗ', points: 10, isRequired: true, photoRequired: true },
          ],
        },
      ],
    });

    const html = renderToStaticMarkup(<AdminChecklistsPage />);

    expect(html).toContain('Приёмка нового стажёра');
  });

  it('renders the checklist builder view (scale scoring, items, assignments) without crashing', () => {
    const loaded = {
      status: 'loaded' as const,
      currentUser,
      checklists: [
        {
          id: 'checklist-1',
          organizationId: 'org-1',
          title: 'Аттестация кассира',
          description: 'Проверка стандарта обслуживания',
          status: 'draft',
          scoringMode: 'scale',
          passThreshold: 60,
          scaleLevels: [
            { level: 1, label: 'Очень плохо', points: 0 },
            { level: 2, label: 'Отлично', points: 100 },
          ],
          requiresReview: true,
          createdBy: 'user-1',
          createdAt: ts,
          updatedAt: ts,
          items: [
            { id: 'item-1', checklistId: 'checklist-1', order: 0, text: 'Работа с кассой', points: 0, isRequired: true, photoRequired: true },
          ],
        },
      ],
    };
    // Call order in AdminChecklistsPage: 1 loadState, 2 search, 3 statusFilter, 4 selectedId, 5 deleteTarget, 6 statusError.
    useStateAtCalls({ 1: loaded, 4: 'checklist-1' });

    const html = renderToStaticMarkup(<AdminChecklistsPage />);

    expect(html).toContain('Аттестация кассира');
    expect(html).toContain('Работа с кассой');
    expect(html).toContain('Очень плохо');
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

describe('filterChecklists', () => {
  const checklists = [
    { id: '1', title: 'Приёмка стажёра', status: 'published' } as never,
    { id: '2', title: 'Аттестация кассира', status: 'draft' } as never,
  ];

  it('filters by status', () => {
    expect(filterChecklists(checklists, '', 'draft')).toEqual([checklists[1]]);
  });

  it('filters by case-insensitive title search', () => {
    expect(filterChecklists(checklists, 'кассира', 'all')).toEqual([checklists[1]]);
  });

  it('returns everything when there is no filter', () => {
    expect(filterChecklists(checklists, '', 'all')).toEqual(checklists);
  });
});
