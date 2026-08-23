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

  it('InstructorChecklistReviewsPage renders the pending-review queue without crashing', () => {
    // Call order in InstructorChecklistReviewsPage: 1 openId, 2 useAsyncData's internal state.
    useStateAtCalls({
      2: {
        status: 'loaded',
        data: {
          firstName: 'Instructor',
          lastName: 'User',
          instances: [
            {
              id: 'instance-1',
              organizationId: 'org-1',
              checklistId: 'checklist-1',
              userId: 'user-1',
              assignedBy: null,
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

  it('renders a checklist review detail view (photo-missing flag) without crashing', () => {
    const loaded = {
      status: 'loaded' as const,
      data: {
        firstName: 'Instructor',
        lastName: 'User',
        instances: [
          {
            id: 'instance-1',
            organizationId: 'org-1',
            checklistId: 'checklist-1',
            userId: 'user-1',
            assignedBy: null,
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
              { id: 'result-1', itemId: 'item-1', checked: true, scaleLevel: null, points: 10, photoUrl: null, photoFileName: null, comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null },
            ],
          },
        ],
      },
    };
    // Call order in InstructorChecklistReviewsPage: 1 openId, 2 useAsyncData's internal state.
    useStateAtCalls({ 1: 'instance-1', 2: loaded });

    const html = renderToStaticMarkup(<InstructorChecklistReviewsPage />);

    expect(html).toContain('Прошёл вводный инструктаж');
  });
});

describe('isReviewFlagged', () => {
  const item = { id: 'item-1', checklistId: 'checklist-1', order: 0, text: 'Item', points: 10, isRequired: true, photoRequired: true };
  const baseResult = { id: 'result-1', itemId: 'item-1', checked: true, scaleLevel: null, points: 10, photoFileName: null, comment: null, reviewStatus: 'pending' as const, reviewComment: null, reviewedBy: null, reviewedAt: null };

  it('flags an item that requires a photo but has none attached', () => {
    expect(isReviewFlagged(item, { ...baseResult, photoUrl: null })).toBe(true);
  });

  it('does not flag an item once a photo is attached', () => {
    expect(isReviewFlagged(item, { ...baseResult, photoUrl: 'https://example.com/photo.jpg' })).toBe(false);
  });

  it('does not flag an item that never required a photo', () => {
    expect(isReviewFlagged({ ...item, photoRequired: false }, { ...baseResult, photoUrl: null })).toBe(false);
  });
});
