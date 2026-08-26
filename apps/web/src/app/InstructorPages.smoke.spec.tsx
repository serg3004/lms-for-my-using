import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
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

import { InstructorChecklistReviewsPage, isReviewFlagged } from './InstructorChecklistReviewsPage';
import { InstructorCourseFormPage } from './InstructorCourseFormPage';
import { InstructorCourseStudentsPage } from './InstructorCourseStudentsPage';
import { InstructorCoursesPage } from './InstructorCoursesPage';
import { InstructorDashboardPage } from './InstructorDashboardPage';

function useLoadingState() {
  reactMocks.useState.mockImplementation((initialState: unknown) => [initialState, vi.fn()]);
}

function useStateAtCalls(overrides: Record<number, unknown>) {
  let callCount = 0;
  reactMocks.useState.mockImplementation((initialState: unknown) => {
    callCount++;
    return [callCount in overrides ? overrides[callCount] : initialState, vi.fn()];
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Instructor pages smoke tests', () => {
  it('InstructorDashboardPage renders without crashing in loading state', () => {
    useLoadingState();
    expect(() => renderToStaticMarkup(<InstructorDashboardPage />)).not.toThrow();
  });

  it('InstructorCoursesPage renders without crashing in loading state', () => {
    useLoadingState();
    expect(() =>
      renderToStaticMarkup(
        <MemoryRouter>
          <InstructorCoursesPage />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it('InstructorCourseFormPage create mode renders without crashing in loading state', () => {
    useLoadingState();
    expect(() =>
      renderToStaticMarkup(
        <MemoryRouter>
          <InstructorCourseFormPage mode="create" />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it('InstructorCourseStudentsPage renders without crashing in loading state', () => {
    useLoadingState();
    expect(() =>
      renderToStaticMarkup(
        <MemoryRouter>
          <InstructorCourseStudentsPage courseId="course-id-1" />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  it('InstructorChecklistReviewsPage renders without crashing in loading state', () => {
    useLoadingState();
    expect(() => renderToStaticMarkup(<InstructorChecklistReviewsPage />)).not.toThrow();
  });

  const emptyAnalytics = {
    assignmentsTotal: 1,
    counts: { assigned: 0, in_progress: 0, submitted: 1, completed: 0, expired: 0 },
    completionRate: 0,
    passRate: 0,
    averagePercentage: 0,
    expiredRate: 0,
    pendingReview: 1,
    averageCompletionTimeMs: 0,
    averageReviewTimeMs: 0,
  };

  it('InstructorChecklistReviewsPage renders the review queue without crashing', () => {
    // Call order in InstructorChecklistReviewsPage: 1 openId, 2 tab, 3 page, 4 useAsyncData's internal state.
    useStateAtCalls({
      4: {
        status: 'loaded',
        data: {
          firstName: 'Instructor',
          lastName: 'User',
          currentUserId: 'user-2',
          isAdmin: false,
          total: 1,
          pageSize: 20,
          analytics: emptyAnalytics,
          instances: [
            {
              id: 'instance-1',
              organizationId: 'org-1',
              checklistId: 'checklist-1',
              userId: 'user-1',
              assignedBy: null,
              reviewerId: null,
              reviewAssignedAt: null,
              reviewAssignedBy: null,
              status: 'submitted',
              totalScore: 10,
              maxScore: 30,
              percentage: 33,
              passed: false,
              dueAt: null,
              submittedAt: '2026-01-01T00:00:00.000Z',
              completedAt: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              checklist: {
                id: 'checklist-1',
                organizationId: 'org-1',
                title: 'Приёмка нового стажёра',
                description: null,
                status: 'published',
                scoringMode: 'sum_points',
                passThreshold: 80,
                scaleLevels: null,
                requiresReview: true,
                createdBy: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
                items: [],
              },
              results: [],
            },
          ],
        },
      },
    });

    const html = renderToStaticMarkup(<InstructorChecklistReviewsPage />);

    expect(html).toContain('Приёмка нового стажёра');
  });

  it('renders a checklist review detail view with object-backed photo evidence', () => {
    const loaded = {
      status: 'loaded' as const,
      data: {
        firstName: 'Instructor',
        lastName: 'User',
        currentUserId: 'user-2',
        isAdmin: false,
        total: 1,
        pageSize: 20,
        analytics: emptyAnalytics,
        instances: [
          {
            id: 'instance-1',
            organizationId: 'org-1',
            checklistId: 'checklist-1',
            userId: 'user-1',
            assignedBy: null,
            reviewerId: null,
            reviewAssignedAt: null,
            reviewAssignedBy: null,
            status: 'submitted',
            totalScore: 10,
            maxScore: 30,
            percentage: 33,
            passed: false,
            dueAt: null,
            submittedAt: '2026-01-01T00:00:00.000Z',
            completedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            checklist: {
              id: 'checklist-1',
              organizationId: 'org-1',
              title: 'Приёмка нового стажёра',
              description: null,
              status: 'published',
              scoringMode: 'sum_points',
              passThreshold: 80,
              scaleLevels: null,
              requiresReview: true,
              createdBy: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              items: [
                { id: 'item-1', checklistId: 'checklist-1', order: 0, text: 'Прошёл вводный инструктаж', points: 10, isRequired: true, photoRequired: true },
              ],
            },
            results: [
              { id: 'result-1', itemId: 'item-1', checked: true, scaleLevel: null, points: 10, photoUrl: null, photoFileName: 'evidence.jpg', comment: 'Done safely', reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null },
            ],
          },
        ],
      },
    };
    // Call order: 1 openInstance, 2 tab, 3 page, 4 useAsyncData's internal state, then
    // ReviewDetail + ChecklistReviewPhotoEvidence add state hooks after that.
    useStateAtCalls({ 1: loaded.data.instances[0], 4: loaded });

    const html = renderToStaticMarkup(<InstructorChecklistReviewsPage />);

    expect(html).toContain('Прошёл вводный инструктаж');
    expect(html).toContain('evidence.jpg');
    expect(html).toContain('Open photo');
    expect(html).toContain('Done safely');
    expect(html).not.toContain('photo missing');
  });

  it('renders analytics KPI cards and queue tabs above the review queue', () => {
    useStateAtCalls({
      4: {
        status: 'loaded',
        data: {
          firstName: 'Instructor',
          lastName: 'User',
          currentUserId: 'user-2',
          isAdmin: false,
          total: 0,
          pageSize: 20,
          analytics: {
            assignmentsTotal: 12,
            counts: { assigned: 2, in_progress: 3, submitted: 4, completed: 3, expired: 0 },
            completionRate: 0.25,
            passRate: 0.67,
            averagePercentage: 71,
            expiredRate: 0,
            pendingReview: 4,
            averageCompletionTimeMs: 0,
            averageReviewTimeMs: 0,
          },
          instances: [],
        },
      },
    });

    const html = renderToStaticMarkup(<InstructorChecklistReviewsPage />);

    expect(html).toContain('12');
    expect(html).toContain('67%');
    expect(html).toContain('Назначено мне');
    expect(html).toContain('Без назначения');
    expect(html).toContain('Все');
  });

  it('shows the reviewer-assignment badge for each queue row', () => {
    const baseInstance = {
      id: 'instance-1', organizationId: 'org-1', checklistId: 'checklist-1', userId: 'user-1',
      assignedBy: null, reviewAssignedAt: null, reviewAssignedBy: null, status: 'submitted' as const,
      totalScore: 0, maxScore: 0, percentage: 0, passed: false, dueAt: null, submittedAt: null,
      completedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      checklist: { id: 'checklist-1', organizationId: 'org-1', title: 'Приёмка', description: null, status: 'published' as const, scoringMode: 'sum_points' as const, passThreshold: 80, scaleLevels: null, requiresReview: true, createdBy: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items: [] },
      results: [],
    };
    useStateAtCalls({
      4: {
        status: 'loaded',
        data: {
          firstName: 'Instructor', lastName: 'User', currentUserId: 'user-2', isAdmin: false,
          total: 3, pageSize: 20, analytics: emptyAnalytics,
          instances: [
            { ...baseInstance, id: 'i-unassigned', reviewerId: null },
            { ...baseInstance, id: 'i-mine', reviewerId: 'user-2' },
            { ...baseInstance, id: 'i-other', reviewerId: 'user-3' },
          ],
        },
      },
    });

    const html = renderToStaticMarkup(<InstructorChecklistReviewsPage />);

    expect(html).toContain('Без назначения');
    expect(html).toContain('Назначено мне');
    expect(html).toContain('Назначено другому проверяющему');
  });

  it('offers "Assign to me" for an unassigned instance in the detail view', () => {
    const loaded = {
      status: 'loaded' as const,
      data: {
        firstName: 'Instructor', lastName: 'User', currentUserId: 'user-2', isAdmin: false,
        total: 1, pageSize: 20, analytics: emptyAnalytics,
        instances: [{
          id: 'instance-1', organizationId: 'org-1', checklistId: 'checklist-1', userId: 'user-1',
          assignedBy: null, reviewerId: null, reviewAssignedAt: null, reviewAssignedBy: null, status: 'submitted' as const,
          totalScore: 0, maxScore: 0, percentage: 0, passed: false, dueAt: null, submittedAt: null,
          completedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
          checklist: { id: 'checklist-1', organizationId: 'org-1', title: 'Приёмка', description: null, status: 'published' as const, scoringMode: 'sum_points' as const, passThreshold: 80, scaleLevels: null, requiresReview: true, createdBy: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items: [] },
          results: [],
        }],
      },
    };
    useStateAtCalls({ 1: loaded.data.instances[0], 4: loaded });

    const html = renderToStaticMarkup(<InstructorChecklistReviewsPage />);

    expect(html).toContain('Назначить себе');
    expect(html).toContain('Загрузка истории');
  });

  it('does not offer reviewer controls for a non-admin viewing another reviewer\'s instance', () => {
    const loaded = {
      status: 'loaded' as const,
      data: {
        firstName: 'Instructor', lastName: 'User', currentUserId: 'user-2', isAdmin: false,
        total: 1, pageSize: 20, analytics: emptyAnalytics,
        instances: [{
          id: 'instance-1', organizationId: 'org-1', checklistId: 'checklist-1', userId: 'user-1',
          assignedBy: null, reviewerId: 'user-3', reviewAssignedAt: '2026-01-01T00:00:00.000Z', reviewAssignedBy: 'admin-1', status: 'submitted' as const,
          totalScore: 0, maxScore: 0, percentage: 0, passed: false, dueAt: null, submittedAt: null,
          completedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
          checklist: { id: 'checklist-1', organizationId: 'org-1', title: 'Приёмка', description: null, status: 'published' as const, scoringMode: 'sum_points' as const, passThreshold: 80, scaleLevels: null, requiresReview: true, createdBy: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items: [] },
          results: [],
        }],
      },
    };
    useStateAtCalls({ 1: loaded.data.instances[0], 4: loaded });

    const html = renderToStaticMarkup(<InstructorChecklistReviewsPage />);

    expect(html).toContain('Назначено другому проверяющему');
    expect(html).not.toContain('Назначить себе');
    expect(html).not.toContain('Снять назначение');
  });
});

describe('isReviewFlagged', () => {
  const item = { id: 'item-1', checklistId: 'checklist-1', order: 0, text: 'Item', points: 10, isRequired: true, photoRequired: true };
  const baseResult = { id: 'result-1', itemId: 'item-1', checked: true, scaleLevel: null, points: 10, photoFileName: null, comment: null, reviewStatus: 'pending' as const, reviewComment: null, reviewedBy: null, reviewedAt: null };

  it('flags an item that requires a photo but has no object-backed evidence', () => {
    expect(isReviewFlagged(item, { ...baseResult, photoUrl: null })).toBe(true);
  });

  it('does not flag object-backed evidence when legacy photoUrl is null', () => {
    expect(isReviewFlagged(item, { ...baseResult, photoUrl: null, photoFileName: 'evidence.jpg' })).toBe(false);
  });

  it('does not accept legacy photoUrl alone as evidence', () => {
    expect(isReviewFlagged(item, { ...baseResult, photoUrl: 'https://example.com/photo.jpg' })).toBe(true);
  });

  it('does not flag an item that never required a photo', () => {
    expect(isReviewFlagged({ ...item, photoRequired: false }, { ...baseResult, photoUrl: null })).toBe(false);
  });
});
