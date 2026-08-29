import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactMocks = vi.hoisted(() => ({
  useEffect: vi.fn(),
  useState: vi.fn(),
}));

const sessionMocks = vi.hoisted(() => ({
  currentUser: {
    id: 'user-1', organizationId: 'org-1', email: 'admin@demo.com', firstName: 'Admin', lastName: 'User',
    middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'en', timezone: 'UTC', roles: ['admin'],
  },
}));

vi.mock('../shared/session.js', () => ({
  useSession: () => ({ currentUser: sessionMocks.currentUser, status: 'authenticated', refreshUser: vi.fn() }),
  useOptionalSession: () => ({ currentUser: sessionMocks.currentUser, status: 'authenticated', refreshUser: vi.fn() }),
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
import { AdminAuditLogPage } from './AdminAuditLogPage';
import {
  AdminChecklistsPage,
  applyItemPatch,
  applyScaleLevelPatch,
  appendScaleLevel,
  buildChecklistSettingsPayload,
  canAssignChecklist,
  computePreviewResult,
  filterAssignableUsers,
  filterChecklists,
  formatUserName,
  removeItemById,
  removeScaleLevelAt,
  resolveUserName,
} from './AdminChecklistsPage';
import { AdminCourseBuilderPage } from './AdminCourseBuilderPage';
import { AdminCoursesPage } from './AdminCoursesPage';
import { AdminDashboardPage } from './AdminDashboardPage';
import { AdminDepartmentsPage } from './AdminDepartmentsPage';
import { AdminGroupsPage } from './AdminGroupsPage';
import { AdminLessonsPage } from './AdminLessonsPage';
import { AdminMaterialsPage } from './AdminMaterialsPage';
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

    // useState call order in AdminCoursesPage: 14 form/dialog states, then
    // useAsyncData's internal state as call #15.
    useStateAtCalls({
      15: {
        status: 'loaded',
        data: {
          currentUser, total: 1, pageSize: 20,
          courses: [{ ...course, createdAt: ts, updatedAt: ts, _count: { lessons: 2 } }],
        },
      },
    });
    expect(renderToStaticMarkup(<AdminCoursesPage />)).toContain('Workplace Safety');
  });

  it('renders groups loading and populated states', () => {
    useLoadingState();
    expect(renderToStaticMarkup(<AdminGroupsPage />)).toContain('role="status"');

    // useState call order in AdminGroupsPage: 21 form/dialog states (19 declared directly,
    // plus the memberSearch/managerSearch useUserSearch() internal states), then
    // useAsyncData's internal state as call #22.
    useStateAtCalls({
      22: {
        status: 'loaded',
        data: {
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
        },
      },
    });
    expect(renderToStaticMarkup(<AdminGroupsPage />)).toContain('Safety');
  });

  it('renders departments loading and populated states', () => {
    useLoadingState();
    expect(renderToStaticMarkup(<AdminDepartmentsPage />)).toContain('role="status"');

    // useState call order in AdminDepartmentsPage: 20 form/dialog states (18 declared directly,
    // plus the search/moveSearch useDepartmentSearch() internal states), then useAsyncData's
    // internal state as call #21. Roots/types themselves are read straight from loadState.data,
    // not seeded into a separate reducer via an effect, so this page renders loaded data on the
    // very first pass even though this test file mocks useEffect to a no-op.
    useStateAtCalls({
      21: {
        status: 'loaded',
        data: {
          organizationId: 'org-1',
          roots: [{
            id: 'dept-1',
            organizationId: 'org-1',
            parentId: null,
            departmentTypeId: null,
            name: 'Engineering',
            code: null,
            description: null,
            sortOrder: 0,
            status: 'active',
            directManagerMode: 'LOCAL',
            functionalManagerMode: 'LOCAL',
            archivedAt: null,
            createdAt: ts,
            updatedAt: ts,
            _count: { children: 0 },
          }],
          types: [],
        },
      },
    });
    expect(renderToStaticMarkup(<AdminDepartmentsPage />)).toContain('Engineering');
  });

  it('renders roles loading and populated states', () => {
    useLoadingState();
    expect(renderToStaticMarkup(<AdminRolesPage />)).toContain('role="status"');

    // useState call order in AdminRolesPage: 1) selectedUserId, 2) selectedRole, 3) submitState,
    // 4) useAsyncData's internal state.
    useStateAtCalls({
      4: {
        status: 'loaded',
        data: {
          users: [{ id: 'user-1', organizationId: 'org-1', email: 'admin@demo.com', firstName: 'Admin', lastName: 'User', middleName: null, status: 'active' }],
          memberships: [{ id: 'membership-1', organizationId: 'org-1', userId: 'user-1', role: 'admin', assignedBy: null, createdAt: ts }],
        },
      },
    });
    expect(renderToStaticMarkup(<AdminRolesPage />)).toContain('admin@demo.com');
  });

  it('renders every theme settings group', () => {
    useLoadingState();
    const html = renderToStaticMarkup(<AdminThemeSettingsPage />);
    expect(html).toContain('Основной цвет');
    expect(html).toContain('Отступы страницы');
    expect(html).toContain('Фон сайдбара');
    expect(html).toContain('href="/admin/appearance"');
    expect(html).not.toContain('/admin/theme-settings');
  });
  it('renders dashboard loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminDashboardPage />);

    expect(html).toContain('admin-state');
  });

  it('renders dashboard authenticated state without crashing', () => {
    useFirstCallReadyState({
      status: 'loaded',
      data: {
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
    // useState call order in useAdminUsers: 1) page, 2) filters, 3) useAsyncData's internal state.
    useStateAtCalls({
      3: {
        status: 'loaded',
        data: {
          currentUser,
          total: 1,
          pageSize: 20,
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
        },
      },
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
    // useState call order in AdminCourseBuilderPage: 10 form/dialog states, then
    // useAsyncData's internal state as call #11.
    useStateAtCalls({
      11: {
        status: 'loaded',
        data: {
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
        },
      },
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
    // useState call order in AdminLessonsPage: 18 form/dialog states, then
    // useAsyncData's internal state as call #19.
    useStateAtCalls({
      19: {
        status: 'loaded',
        data: {
          courses: [course],
          lessons: [{ ...lesson, course: { title: course.title } }],
        },
      },
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
    // useState call order in AdminMaterialsPage: 25 form/dialog states, then
    // useAsyncData's internal loadState useState is call 26.
    useStateAtCalls({
      26: {
        status: 'loaded',
        data: {
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
        },
      },
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
    // useState call order in AdminChecklistsPage: 1 search, 2 statusFilter, 3 selectedId,
    // 4 deleteTarget, 5 statusError, then useAsyncData's internal loadState is call 6.
    useStateAtCalls({
      6: {
        status: 'loaded',
        data: {
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
        },
      },
    });

    const html = renderToStaticMarkup(<AdminChecklistsPage />);

    expect(html).toContain('Приёмка нового стажёра');
  });

  it('renders the checklist builder view (scale scoring, items, assignments) without crashing', () => {
    const loaded = {
      status: 'loaded' as const,
      data: {
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
      },
    };
    // Call order in AdminChecklistsPage: 1 search, 2 statusFilter, 3 selectedId, 4 deleteTarget,
    // 5 statusError, 6 useAsyncData's internal loadState.
    useStateAtCalls({ 3: 'checklist-1', 6: loaded });

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
    // useState call order in AdminResultsCertificatesPage: courseId, userId, assessmentId,
    // assessmentAttemptId, submitState, then useAsyncData's internal state as call #6.
    useStateAtCalls({
      6: {
        status: 'loaded',
        data: {
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
          overdueAssignments: [],
          reportsCounts: {
            progressTotal: 0,
            progressCompletedTotal: 0,
            progressAvgScore: null,
            certificatesIssuedTotal: 1,
            overdueTotal: 0,
          },
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
          selectedAssessmentId: 'assessment-1',
        },
      },
    });

    const html = renderToStaticMarkup(<AdminResultsCertificatesPage />);

    expect(html).toContain('Learner User');
  });

  it('renders audit log loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminAuditLogPage />);

    expect(html).toContain('role="status"');
  });

  it('renders audit log happy path without crashing', () => {
    // useState call order in AdminAuditLogPage: 1 page, 2 actionFilter, 3 targetTypeFilter,
    // then useAsyncData's internal loadState is call 4.
    useStateAtCalls({
      4: {
        status: 'loaded',
        data: {
          entries: [
            {
              id: 'audit-1',
              organizationId: 'org-1',
              action: 'course.created',
              actorId: 'user-1',
              actor: { id: 'user-1', firstName: 'Admin', lastName: 'User', email: 'admin@demo.com' },
              targetType: 'course',
              targetId: 'course-1',
              summary: 'Created course',
              metadata: null,
              createdAt: ts,
            },
          ],
          total: 1,
          pageSize: 20,
          filterOptions: { actions: ['course.created'], targetTypes: ['course'] },
        },
      },
    });

    const html = renderToStaticMarkup(<AdminAuditLogPage />);

    expect(html).toContain('Created course');
  });

  it('renders assignment completion loading state without crashing', () => {
    useLoadingState();

    const html = renderToStaticMarkup(<AdminAssignmentCompletionPage />);

    expect(html).toContain('role="status"');
  });

  it('renders assignment completion happy path without crashing', () => {
    // useState call order in AdminAssignmentCompletionPage: 9 form/dialog states, then
    // useAsyncData's internal loadState useState is call 10.
    useStateAtCalls({
      10: {
        status: 'loaded',
        data: {
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
          groups: [],
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
        },
      },
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

describe('formatUserName', () => {
  it('joins first and last name', () => {
    expect(formatUserName({ firstName: 'Aigerim', lastName: 'Kassirova', email: 'a@demo.com' })).toBe('Aigerim Kassirova');
  });

  it('falls back to email when there is no name', () => {
    expect(formatUserName({ firstName: '', lastName: null, email: 'a@demo.com' })).toBe('a@demo.com');
  });
});

describe('resolveUserName', () => {
  const users = [{ id: 'user-1', organizationId: 'org-1', email: 'a@demo.com', firstName: 'Aigerim', lastName: 'Kassirova', status: 'active' }];

  it('resolves a known user to their display name', () => {
    expect(resolveUserName(users, 'user-1')).toBe('Aigerim Kassirova');
  });

  it('falls back to the raw id for an unknown user', () => {
    expect(resolveUserName(users, 'user-missing')).toBe('user-missing');
  });
});

describe('filterAssignableUsers', () => {
  const users = [
    { id: 'user-1', organizationId: 'org-1', email: 'a@demo.com', firstName: 'Aigerim', lastName: 'Kassirova', status: 'active' },
    { id: 'user-2', organizationId: 'org-1', email: 'b@demo.com', firstName: 'Bekzat', lastName: 'Nurov', status: 'active' },
  ];
  const activeInstance = { id: 'i-1', organizationId: 'org-1', checklistId: 'c-1', userId: 'user-1', assignedBy: null, reviewerId: null, reviewAssignedAt: null, reviewAssignedBy: null, status: 'assigned' as const, totalScore: 0, maxScore: 0, percentage: 0, passed: false, dueAt: null, submittedAt: null, completedAt: null, createdAt: ts, updatedAt: ts, results: [] };

  it('excludes a user who already has an active assignment', () => {
    expect(filterAssignableUsers(users, [activeInstance])).toEqual([users[1]]);
  });

  it('re-includes a user whose previous assignment expired', () => {
    expect(filterAssignableUsers(users, [{ ...activeInstance, status: 'expired' }])).toEqual(users);
  });

  it('returns everyone when there are no assignments yet', () => {
    expect(filterAssignableUsers(users, [])).toEqual(users);
  });
});

describe('buildChecklistSettingsPayload', () => {
  it('nulls out an empty description', () => {
    const payload = buildChecklistSettingsPayload({ title: 'Т', description: '', scoringMode: 'sum_points', passThreshold: 80, requiresReview: false, scaleLevels: [] });
    expect(payload.description).toBeNull();
  });

  it('drops scale levels when the scoring mode is not scale', () => {
    const payload = buildChecklistSettingsPayload({ title: 'Т', description: 'd', scoringMode: 'all_required', passThreshold: 80, requiresReview: false, scaleLevels: [{ level: 1, label: 'x', points: 1 }] });
    expect(payload.scaleLevels).toBeNull();
  });

  it('keeps scale levels when the scoring mode is scale', () => {
    const levels = [{ level: 1, label: 'x', points: 1 }];
    const payload = buildChecklistSettingsPayload({ title: 'Т', description: 'd', scoringMode: 'scale', passThreshold: 80, requiresReview: false, scaleLevels: levels });
    expect(payload.scaleLevels).toEqual(levels);
  });
});

describe('canAssignChecklist', () => {
  it('requires the checklist to be published', () => {
    expect(canAssignChecklist('draft', 'user-1')).toBe(false);
  });

  it('requires a selected user', () => {
    expect(canAssignChecklist('published', '')).toBe(false);
  });

  it('allows assignment once both conditions hold', () => {
    expect(canAssignChecklist('published', 'user-1')).toBe(true);
  });
});

describe('item and scale-level local-state helpers', () => {
  const items = [
    { id: 'item-1', checklistId: 'c-1', order: 0, text: 'A', points: 10, isRequired: true, photoRequired: false },
    { id: 'item-2', checklistId: 'c-1', order: 1, text: 'B', points: 20, isRequired: true, photoRequired: false },
  ];
  const levels = [
    { level: 1, label: 'Bad', points: 0 },
    { level: 2, label: 'Good', points: 100 },
  ];

  it('applyItemPatch merges a patch into the matching item only', () => {
    expect(applyItemPatch(items, 'item-1', { text: 'A updated' })).toEqual([{ ...items[0], text: 'A updated' }, items[1]]);
  });

  it('removeItemById drops only the matching item', () => {
    expect(removeItemById(items, 'item-1')).toEqual([items[1]]);
  });

  it('applyScaleLevelPatch merges a patch by index only', () => {
    expect(applyScaleLevelPatch(levels, 1, { label: 'Great' })).toEqual([levels[0], { ...levels[1], label: 'Great' }]);
  });

  it('appendScaleLevel adds a new blank level numbered after the last one', () => {
    expect(appendScaleLevel(levels)).toEqual([...levels, { level: 3, label: '', points: 0 }]);
  });

  it('removeScaleLevelAt drops only the level at that index', () => {
    expect(removeScaleLevelAt(levels, 0)).toEqual([levels[1]]);
  });
});

describe('computePreviewResult', () => {
  const items = [
    { id: 'item-1', checklistId: 'c-1', order: 0, text: 'Item 1', points: 10, isRequired: true, photoRequired: false },
    { id: 'item-2', checklistId: 'c-1', order: 1, text: 'Item 2', points: 20, isRequired: true, photoRequired: false },
  ];

  it('scores sum_points mode from checked items', () => {
    const result = computePreviewResult(items, 'sum_points', [], 80, { 'item-1': { checked: true }, 'item-2': { checked: false } });
    expect(result).toEqual({ totalScore: 10, maxScore: 30, percentage: 33, passed: false, allAnswered: false });
  });

  it('scores all_required mode as 1 point per checked item regardless of configured points', () => {
    const result = computePreviewResult(items, 'all_required', [], 100, { 'item-1': { checked: true }, 'item-2': { checked: true } });
    expect(result).toEqual({ totalScore: 2, maxScore: 2, percentage: 100, passed: true, allAnswered: true });
  });

  it('scores scale mode from the configured level points', () => {
    const scale = [{ level: 1, label: 'Bad', points: 0 }, { level: 5, label: 'Great', points: 100 }];
    const result = computePreviewResult(items, 'scale', scale, 50, { 'item-1': { scaleLevel: 5 }, 'item-2': { scaleLevel: 5 } });
    expect(result).toEqual({ totalScore: 200, maxScore: 200, percentage: 100, passed: true, allAnswered: true });
  });

  it('is not marked passed until every item has an answer', () => {
    const result = computePreviewResult(items, 'sum_points', [], 0, { 'item-1': { checked: true } });
    expect(result.allAnswered).toBe(false);
    expect(result.passed).toBe(false);
  });
});
