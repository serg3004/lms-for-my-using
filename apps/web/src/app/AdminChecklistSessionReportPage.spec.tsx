import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ChecklistInstanceSummary,
  ChecklistScoreRevision,
  ChecklistSessionEvent,
  ChecklistSessionSummary,
} from '../shared/api/types.js';

const reactMocks = vi.hoisted(() => ({ useState: vi.fn() }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useState: reactMocks.useState };
});

const sessionMocks = vi.hoisted(() => ({
  currentUser: {
    id: 'admin-1', organizationId: 'org-1', email: 'admin@demo.com', firstName: 'Admin', lastName: 'User',
    middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'en', timezone: 'UTC', roles: ['admin'],
  },
}));
vi.mock('../shared/session.js', () => ({
  useSession: () => ({ currentUser: sessionMocks.currentUser, status: 'authenticated', refreshUser: vi.fn() }),
  useOptionalSession: () => ({ currentUser: sessionMocks.currentUser, status: 'authenticated', refreshUser: vi.fn() }),
}));

const apiMocks = vi.hoisted(() => ({
  captureChecklistSessionLocation: vi.fn(),
  getChecklistInstance: vi.fn(),
  getChecklistSession: vi.fn(),
  listChecklistScoreRevisions: vi.fn(),
  listChecklistSessionEvents: vi.fn(),
  listChecklistSessionLocationCaptures: vi.fn(),
  recalculateChecklistSessionScore: vi.fn(),
}));
vi.mock('../shared/api/checklists.js', () => ({ getChecklistInstance: apiMocks.getChecklistInstance }));
vi.mock('../shared/api/checklistSessions.js', () => ({
  captureChecklistSessionLocation: apiMocks.captureChecklistSessionLocation,
  getChecklistSession: apiMocks.getChecklistSession,
  listChecklistScoreRevisions: apiMocks.listChecklistScoreRevisions,
  listChecklistSessionEvents: apiMocks.listChecklistSessionEvents,
  listChecklistSessionLocationCaptures: apiMocks.listChecklistSessionLocationCaptures,
  recalculateChecklistSessionScore: apiMocks.recalculateChecklistSessionScore,
}));

import {
  AdminChecklistSessionReportPage,
  findResultForItem,
  HistoryTab,
  LocationOverrideForm,
  RecalculateForm,
  SessionReportBody,
} from './AdminChecklistSessionReportPage.js';

const t = ((key: string, fallback?: string) => fallback ?? key) as unknown as TFunction;

afterEach(() => {
  vi.restoreAllMocks();
});

function makeSession(overrides: Partial<ChecklistSessionSummary> = {}): ChecklistSessionSummary {
  return {
    id: 'session-1', organizationId: 'org-1', instanceId: 'instance-1', observerId: 'observer-1',
    status: 'completed', version: 2, scheduledAt: '2026-02-01T09:00:00.000Z', startedAt: '2026-02-01T09:05:00.000Z',
    pausedAt: null, locationCapturePolicy: 'required', timezone: 'UTC', overdue: false,
    strengths: 'Great attention to detail', developmentAreas: null, nextSteps: null,
    observerUnavailableReason: null, observerUnavailableAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T09:05:00.000Z',
    checklist: { id: 'checklist-1', title: 'Opening shift checklist' },
    learner: { id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid' },
    observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
    result: { instanceStatus: 'completed', percentage: 92, passed: true, scored: true, visible: true },
    ...overrides,
  };
}

describe('findResultForItem', () => {
  it('finds the result matching the given item id', () => {
    const results = [{ id: 'r1', itemId: 'item-1' } as ChecklistInstanceSummary['results'][number]];
    expect(findResultForItem(results, 'item-1')).toBe(results[0]);
    expect(findResultForItem(results, 'item-missing')).toBeUndefined();
  });
});

describe('AdminChecklistSessionReportPage', () => {
  it('renders the loading shell without crashing while wrapped in a router', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/admin/checklists/sessions/session-1']}><AdminChecklistSessionReportPage /></MemoryRouter>);
    expect(html).toContain('Загрузка');
  });
});

describe('SessionReportBody', () => {
  it('renders the summary tab by default with checklist/result/feedback', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<SessionReportBody session={makeSession()} reloadSession={vi.fn()} t={t} />);
    expect(html).toContain('Opening shift checklist');
    expect(html).toContain('92% ✓');
    expect(html).toContain('Great attention to detail');
  });

  it('renders the participants tab with learner and observer', () => {
    reactMocks.useState
      .mockReturnValueOnce(['participants', vi.fn()])
      .mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<SessionReportBody session={makeSession()} reloadSession={vi.fn()} t={t} />);
    expect(html).toContain('Leo Learner');
    expect(html).toContain('Olga Observer');
  });

  it('renders criteria from the loaded instance, marking a completed item', () => {
    const instance: ChecklistInstanceSummary = {
      id: 'instance-1', organizationId: 'org-1', checklistId: 'checklist-1', userId: 'learner-1',
      assignedBy: 'observer-1', reviewerId: null, reviewAssignedAt: null, reviewAssignedBy: null,
      status: 'completed', totalScore: 10, maxScore: 10, percentage: 100, passed: true,
      dueAt: null, submittedAt: null, completedAt: '2026-02-01T10:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T10:00:00.000Z',
      checklist: {
        id: 'checklist-1', organizationId: 'org-1', title: 'Opening shift checklist', description: null,
        status: 'published', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
        createdBy: 'admin-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        items: [{ id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Turn on the lights', points: 10, isRequired: true, photoRequired: false }],
      },
      results: [{ id: 'result-1', itemId: 'item-1', checked: true, scaleLevel: null, points: 10, photoUrl: null, photoFileName: null, comment: 'Done well', reviewStatus: 'approved', reviewComment: null, reviewedBy: null, reviewedAt: null }],
    };
    reactMocks.useState.mockImplementation((initial: unknown) => {
      if (initial === 'summary') return ['criteria', vi.fn()];
      if (typeof initial === 'object' && initial !== null && 'status' in (initial as object)) return [{ status: 'loaded', data: instance }, vi.fn()];
      return [initial, vi.fn()];
    });
    const html = renderToStaticMarkup(<SessionReportBody session={makeSession()} reloadSession={vi.fn()} t={t} />);
    expect(html).toContain('Turn on the lights');
    expect(html).toContain('Done well');
  });
});

describe('RecalculateForm', () => {
  it('disables submit until a reason is entered', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<RecalculateForm sessionId="session-1" onDone={vi.fn()} t={t} />);
    expect(html).toContain('disabled=""');
  });
});

describe('LocationOverrideForm', () => {
  it('renders nothing when every capture point already has a row', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<LocationOverrideForm missingPoints={[]} onDone={vi.fn()} sessionId="session-1" t={t} />);
    expect(html).toBe('');
  });

  it('offers only the missing capture point(s) and disables submit until a reason is entered', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<LocationOverrideForm missingPoints={['end']} onDone={vi.fn()} sessionId="session-1" t={t} />);
    expect(html).toContain('value="end"');
    expect(html).not.toContain('value="start"');
    expect(html).toContain('disabled=""');
  });

  it('shows latitude/longitude fields only when status is "captured"', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => {
      if (initial === 'captured') return ['denied', vi.fn()];
      return [initial, vi.fn()];
    });
    const html = renderToStaticMarkup(<LocationOverrideForm missingPoints={['start', 'end']} onDone={vi.fn()} sessionId="session-1" t={t} />);
    expect(html).not.toContain('Latitude');
  });
});

describe('HistoryTab', () => {
  it('shows empty states when there are no events or revisions', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => {
      if (typeof initial === 'object' && initial !== null && 'status' in (initial as object)) {
        return [{ status: 'loaded', data: { events: [] as ChecklistSessionEvent[], revisions: [] as ChecklistScoreRevision[] } }, vi.fn()];
      }
      return [initial, vi.fn()];
    });
    const html = renderToStaticMarkup(<HistoryTab sessionId="session-1" isAdmin={false} onRecalculated={vi.fn()} t={t} />);
    expect(html).toContain('No events recorded yet.');
    expect(html).toContain('The score has never been recalculated.');
    expect(html).not.toContain('Recalculate score'); // not admin
  });

  it('lists events and revisions, and shows the recalculate form for an admin', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => {
      if (typeof initial === 'object' && initial !== null && 'status' in (initial as object)) {
        return [{
          status: 'loaded',
          data: {
            events: [{ id: 'e1', organizationId: 'org-1', sessionId: 'session-1', eventType: 'score_recalculated', actorUserId: 'admin-1', metadata: null, createdAt: '2026-02-01T09:00:00.000Z' }],
            revisions: [{ id: 'r1', organizationId: 'org-1', instanceId: 'instance-1', previousPercentage: 60, newPercentage: 90, previousPassed: false, newPassed: true, reason: 'Fixing a bug', actorUserId: 'admin-1', createdAt: '2026-02-01T09:00:00.000Z' }],
          },
        }, vi.fn()];
      }
      return [initial, vi.fn()];
    });
    const html = renderToStaticMarkup(<HistoryTab sessionId="session-1" isAdmin={true} onRecalculated={vi.fn()} t={t} />);
    expect(html).toContain('60% → 90%');
    expect(html).toContain('Fixing a bug');
    expect(html).toContain('Recalculate score');
  });
});
