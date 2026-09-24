import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactMocks = vi.hoisted(() => ({ useState: vi.fn() }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useState: reactMocks.useState };
});

const apiMocks = vi.hoisted(() => ({ listChecklistSessions: vi.fn() }));
vi.mock('../shared/api/checklistSessions.js', () => ({ listChecklistSessions: apiMocks.listChecklistSessions }));

import { fetchLearnerSessions, LearnerChecklistSessions, LearnerSessionDetail, tabOf } from './LearnerChecklistSessions.js';
import type { ChecklistInstanceSummary, ChecklistSessionSummary } from '../shared/api/types.js';

const t = ((key: string, fallback?: string, params?: Record<string, unknown>) => {
  const text = fallback ?? key;
  return params ? text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? '')) : text;
}) as unknown as TFunction;

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

function makeSession(overrides: Partial<ChecklistSessionSummary> = {}): ChecklistSessionSummary {
  return {
    id: 'session-1',
    organizationId: 'org-1',
    instanceId: 'instance-1',
    observerId: 'observer-1',
    status: 'scheduled',
    version: 1,
    scheduledAt: '2026-02-01T09:00:00.000Z',
    startedAt: null,
    pausedAt: null,
    locationCapturePolicy: 'off',
    timezone: 'UTC',
    overdue: false,
    strengths: null,
    developmentAreas: null,
    nextSteps: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    checklist: { id: 'checklist-1', title: 'Opening shift checklist' },
    learner: { id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid' },
    observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
    result: { instanceStatus: 'assigned', percentage: null, passed: null, scored: null, visible: true },
    ...overrides,
  };
}

describe('tabOf', () => {
  it('maps session statuses to the three learner tabs', () => {
    expect(tabOf('scheduled')).toBe('scheduled');
    expect(tabOf('in_progress')).toBe('active');
    expect(tabOf('paused')).toBe('active');
    expect(tabOf('completed')).toBe('done');
    expect(tabOf('cancelled')).toBe('done');
  });
});

describe('fetchLearnerSessions', () => {
  it('unwraps the paginated response', async () => {
    apiMocks.listChecklistSessions.mockResolvedValueOnce({ items: [makeSession()], page: 1, pageSize: 100, total: 1 });
    const items = await fetchLearnerSessions();
    expect(items).toEqual([makeSession()]);
    expect(apiMocks.listChecklistSessions).toHaveBeenCalledWith({ pageSize: 100 });
  });
});

describe('LearnerChecklistSessions', () => {
  it('renders nothing while loading (SSR-only, effects never run)', () => {
    reactMocks.useState.mockImplementation((initialState: unknown) => [initialState, vi.fn()]);
    expect(() => renderToStaticMarkup(<LearnerChecklistSessions t={t} />)).not.toThrow();
  });

  it('renders nothing when the learner has no sessions', () => {
    // Call order: 1 tab, 2 openSessionId, 3 useAsyncData's internal state.
    useStateAtCalls({ 3: { status: 'loaded', data: [] } });
    const html = renderToStaticMarkup(<LearnerChecklistSessions t={t} />);
    expect(html).toBe('');
  });

  it('shows the scheduled tab by default and the observer/checklist for each session', () => {
    useStateAtCalls({
      1: 'scheduled',
      3: { status: 'loaded', data: [makeSession({ id: 'session-1', status: 'scheduled' }), makeSession({ id: 'session-2', status: 'completed' })] },
    });
    const html = renderToStaticMarkup(<LearnerChecklistSessions t={t} />);
    expect(html).toContain('Opening shift checklist');
    expect(html).toContain('Olga Observer');
  });

  it('shows a completed session with a visible passing result', () => {
    useStateAtCalls({
      1: 'done',
      3: {
        status: 'loaded',
        data: [makeSession({ id: 'session-1', status: 'completed', result: { instanceStatus: 'completed', percentage: 92, passed: true, scored: true, visible: true } })],
      },
    });
    const html = renderToStaticMarkup(<LearnerChecklistSessions t={t} />);
    expect(html).toContain('92%');
  });

  it('renders an error state', () => {
    useStateAtCalls({ 3: { status: 'error', message: 'Unable to load your training sessions.' } });
    const html = renderToStaticMarkup(<LearnerChecklistSessions t={t} />);
    expect(html).toContain('Unable to load your training sessions.');
  });
});

function instance(overrides: Partial<ChecklistInstanceSummary> = {}): ChecklistInstanceSummary {
  return {
    id: 'instance-1',
    organizationId: 'org-1',
    checklistId: 'checklist-1',
    userId: 'learner-1',
    assignedBy: 'observer-1',
    reviewerId: null,
    reviewAssignedAt: null,
    reviewAssignedBy: null,
    status: 'completed',
    totalScore: 9,
    maxScore: 10,
    percentage: 90,
    passed: true,
    dueAt: null,
    submittedAt: null,
    completedAt: '2026-02-01T10:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    checklist: {
      id: 'checklist-1',
      organizationId: 'org-1',
      title: 'Opening shift checklist',
      description: null,
      status: 'published',
      scoringMode: 'sum_points',
      passThreshold: 80,
      scaleLevels: null,
      requiresReview: true,
      createdBy: 'admin-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      items: [
        { id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Turn on the lights', points: 10, isRequired: true, photoRequired: false },
      ],
    },
    results: [
      { id: 'result-1', itemId: 'item-1', checked: true, scaleLevel: null, points: 10, photoUrl: null, photoFileName: null, comment: 'Done well', reviewStatus: 'approved', reviewComment: null, reviewedBy: null, reviewedAt: null },
    ],
    ...overrides,
  };
}

describe('LearnerSessionDetail (real hooks)', () => {
  const onBack = vi.fn();

  it('hides the result and feedback while not visible', () => {
    const html = renderToStaticMarkup(
      <LearnerSessionDetail
        session={makeSession({ status: 'in_progress', result: { instanceStatus: 'in_progress', percentage: null, passed: null, scored: null, visible: false } })}
        onBack={onBack}
        t={t}
      />,
    );
    expect(html).toContain('Your result will be visible once the session is completed.');
    expect(html).not.toContain('Passed');
  });

  it('shows the result, feedback, and criteria once visible', () => {
    const html = renderToStaticMarkup(
      <LearnerSessionDetail
        session={makeSession({
          status: 'completed',
          strengths: 'Great attention to detail',
          developmentAreas: 'Speed',
          nextSteps: 'Practice weekly',
          result: { instanceStatus: 'completed', percentage: 92, passed: true, scored: true, visible: true },
        })}
        onBack={onBack}
        t={t}
      />,
    );
    expect(html).toContain('92%');
    expect(html).toContain('Great attention to detail');
  });
});

describe('LearnerSessionDetail with a loaded instance', () => {
  it('renders criteria comments once the instance loads', () => {
    reactMocks.useState.mockImplementation((initialState: unknown) => {
      if (typeof initialState === 'object' && initialState !== null && 'status' in (initialState as object)) {
        return [{ status: 'loaded', data: instance() }, vi.fn()];
      }
      return [initialState, vi.fn()];
    });
    const html = renderToStaticMarkup(
      <LearnerSessionDetail
        session={makeSession({ status: 'completed', result: { instanceStatus: 'completed', percentage: 90, passed: true, scored: true, visible: true } })}
        onBack={vi.fn()}
        t={t}
      />,
    );
    expect(html).toContain('Turn on the lights');
    expect(html).toContain('Done well');
  });
});
