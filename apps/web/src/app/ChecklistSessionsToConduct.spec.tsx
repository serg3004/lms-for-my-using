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

import { ChecklistSessionsToConduct, fetchObserverSessions, makeOpenHandler } from './ChecklistSessionsToConduct.js';
import type { ChecklistSessionSummary } from '../shared/api/types.js';

const t = ((key: string, fallback?: string) => fallback ?? key) as unknown as TFunction;

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

function makeSession(overrides: Partial<ChecklistSessionSummary>): ChecklistSessionSummary {
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
    result: { instanceStatus: 'assigned', percentage: 0, passed: false, scored: false, visible: true },
    ...overrides,
  };
}

describe('fetchObserverSessions', () => {
  it('unwraps the paginated response into a plain array', async () => {
    apiMocks.listChecklistSessions.mockResolvedValueOnce({ items: [makeSession({ id: 'session-9' })], page: 1, pageSize: 100, total: 1 });
    const items = await fetchObserverSessions();
    expect(items).toEqual([makeSession({ id: 'session-9' })]);
    expect(apiMocks.listChecklistSessions).toHaveBeenCalledWith({ pageSize: 100 });
  });
});

describe('makeOpenHandler', () => {
  it('curries onOpenSession with the given session id', () => {
    const onOpenSession = vi.fn();
    makeOpenHandler(onOpenSession, 'session-42')();
    expect(onOpenSession).toHaveBeenCalledWith('session-42');
  });
});

describe('ChecklistSessionsToConduct', () => {
  it('renders in the loading state without crashing', () => {
    reactMocks.useState.mockImplementation((initialState: unknown) => [initialState, vi.fn()]);
    expect(() => renderToStaticMarkup(<ChecklistSessionsToConduct onOpenSession={vi.fn()} t={t} />)).not.toThrow();
  });

  it('renders an empty state when the observer has no sessions', () => {
    useStateAtCalls({ 1: { status: 'loaded', data: [] } });
    const html = renderToStaticMarkup(<ChecklistSessionsToConduct onOpenSession={vi.fn()} t={t} />);
    expect(html).toContain('No checklist sessions are assigned to you yet.');
  });

  it('splits sessions into "to conduct" and "history" groups', () => {
    useStateAtCalls({
      1: {
        status: 'loaded',
        data: [
          makeSession({ id: 'session-1', status: 'scheduled' }),
          makeSession({ id: 'session-2', status: 'in_progress' }),
          makeSession({ id: 'session-3', status: 'completed' }),
        ],
      },
    });
    const html = renderToStaticMarkup(<ChecklistSessionsToConduct onOpenSession={vi.fn()} t={t} />);
    expect(html).toContain('To conduct');
    expect(html).toContain('History');
    expect(html).toContain('Leo Learner');
  });

  it('renders an error state', () => {
    useStateAtCalls({ 1: { status: 'error', message: 'Unable to load your sessions.' } });
    const html = renderToStaticMarkup(<ChecklistSessionsToConduct onOpenSession={vi.fn()} t={t} />);
    expect(html).toContain('Unable to load your sessions.');
  });
});
