// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ listChecklistSessions: vi.fn() }));
vi.mock('../shared/api/checklistSessions.js', () => ({ listChecklistSessions: apiMocks.listChecklistSessions }));

import { fetchPastSessions, PAST_SESSIONS_LIMIT, PastSessions } from './ChecklistSessionHistory.js';
import type { ChecklistSessionSummary } from '../shared/api/types.js';

const t = ((key: string, fallback?: string) => fallback ?? key) as unknown as TFunction;

function past(overrides: Partial<ChecklistSessionSummary> = {}): ChecklistSessionSummary {
  return {
    id: 'past-1', organizationId: 'org-1', instanceId: 'instance-0', observerId: 'observer-1', status: 'completed', version: 3,
    scheduledAt: null, durationMinutes: null, startedAt: '2026-01-10T09:00:00.000Z', pausedAt: null, locationCapturePolicy: 'off',
    timezone: 'UTC', overdue: false, strengths: 'Clear handover', developmentAreas: 'Speed at the till', nextSteps: null,
    observerUnavailableReason: null, observerUnavailableAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-10T10:00:00.000Z',
    checklist: { id: 'checklist-1', title: 'Opening shift' },
    learner: { id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'leo@example.invalid' },
    observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'olga@example.invalid' },
    result: { instanceStatus: 'completed', percentage: 85, passed: true, scored: true, visible: true },
    ...overrides,
  };
}
const current = past({ id: 'current', status: 'scheduled', startedAt: null, result: { instanceStatus: 'assigned', percentage: null, passed: null, scored: null, visible: true } });

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  vi.clearAllMocks();
});

async function mount() {
  const container = document.createElement('div');
  root = createRoot(container);
  await act(async () => { root?.render(<PastSessions session={current} t={t} />); });
  return container;
}

describe('PastSessions (PR 332)', () => {
  it('asks only for this employee’s and sheet’s last completed sessions, newest first, without the open one', async () => {
    apiMocks.listChecklistSessions.mockResolvedValue({ items: [], page: 1, pageSize: PAST_SESSIONS_LIMIT, total: 0 });
    await fetchPastSessions(current);
    expect(apiMocks.listChecklistSessions).toHaveBeenCalledWith({
      status: 'completed', learnerId: 'learner-1', checklistId: 'checklist-1', sort: 'recent', excludeSessionId: 'current', pageSize: PAST_SESSIONS_LIMIT,
    });
  });

  it('shows result, strengths and growth areas of each past session', async () => {
    apiMocks.listChecklistSessions.mockResolvedValue({
      items: [past(), past({ id: 'past-2', strengths: null, developmentAreas: null, result: { instanceStatus: 'completed', percentage: 40, passed: false, scored: true, visible: true } })],
      page: 1, pageSize: PAST_SESSIONS_LIMIT, total: 2,
    });
    const container = await mount();
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.textContent).toContain('85% ✓');
    expect(container.textContent).toContain('Clear handover');
    expect(container.textContent).toContain('Speed at the till');
    expect(container.textContent).toContain('40% ✗');
    expect(container.textContent).toContain('No feedback was recorded.');
  });

  it('shows a calm empty state when there is no history', async () => {
    apiMocks.listChecklistSessions.mockResolvedValue({ items: [], page: 1, pageSize: PAST_SESSIONS_LIMIT, total: 0 });
    const container = await mount();
    expect(container.textContent).toContain('No completed sessions with this employee on this sheet yet.');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('reports a load error with a retry that does not block starting the session', async () => {
    apiMocks.listChecklistSessions.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ items: [past()], page: 1, pageSize: PAST_SESSIONS_LIMIT, total: 1 });
    const container = await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Unable to load past sessions.');
    await act(async () => { container.querySelector('button')?.click(); });
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
