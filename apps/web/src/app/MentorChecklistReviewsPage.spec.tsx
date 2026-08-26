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

import { MentorChecklistReviewsPage } from './MentorChecklistReviewsPage';

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

describe('MentorChecklistReviewsPage smoke tests', () => {
  it('renders without crashing in loading state', () => {
    useLoadingState();
    expect(() => renderToStaticMarkup(<MentorChecklistReviewsPage />)).not.toThrow();
  });

  it('renders the review queue under the mentor layout', () => {
    // Call order: 1 openId, 2 tab, 3 page, 4 useAsyncData's internal state.
    useStateAtCalls({
      4: {
        status: 'loaded',
        data: {
          firstName: 'Mentor',
          lastName: 'User',
          currentUserId: 'user-2',
          isAdmin: false,
          total: 1,
          pageSize: 20,
          analytics: {
            assignmentsTotal: 1,
            counts: { assigned: 0, in_progress: 0, submitted: 1, completed: 0, expired: 0 },
            completionRate: 0,
            passRate: 0,
            averagePercentage: 0,
            expiredRate: 0,
            pendingReview: 1,
            averageCompletionTimeMs: 0,
            averageReviewTimeMs: 0,
          },
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
                title: 'Аттестация наставника',
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

    const html = renderToStaticMarkup(<MentorChecklistReviewsPage />);

    expect(html).toContain('Аттестация наставника');
    expect(html).toContain('href="/mentor"');
  });
});
