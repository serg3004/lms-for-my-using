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
  getChecklistSessionReport: vi.fn(),
  listChecklistScoreRevisions: vi.fn(),
  listChecklistSessionEvents: vi.fn(),
  listChecklistSessionLocationCaptures: vi.fn(),
  recalculateChecklistSessionScore: vi.fn(),
}));
vi.mock('../shared/api/checklists.js', () => ({ getChecklistInstance: apiMocks.getChecklistInstance }));
vi.mock('../shared/api/checklistSessions.js', () => ({
  captureChecklistSessionLocation: apiMocks.captureChecklistSessionLocation,
  getChecklistSession: apiMocks.getChecklistSession,
  getChecklistSessionReport: apiMocks.getChecklistSessionReport,
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
  RecalculateDialog,
  RecalculateForm,
  SessionReportBody,
} from './AdminChecklistSessionReportPage.js';

const t = ((key: string, fallback?: string, params?: Record<string, unknown>) => {
  const text = fallback ?? key;
  return params ? text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? '')) : text;
}) as unknown as TFunction;

afterEach(() => {
  vi.restoreAllMocks();
});

function makeSession(overrides: Partial<ChecklistSessionSummary> = {}): ChecklistSessionSummary {
  return {
    id: 'session-1', organizationId: 'org-1', instanceId: 'instance-1', observerId: 'observer-1',
    status: 'completed', version: 2, scheduledAt: '2026-02-01T09:00:00.000Z', startedAt: '2026-02-01T09:05:00.000Z',
    durationMinutes: null,
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
  it('shows the summary tab by default and loads its content from the server report', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<SessionReportBody session={makeSession()} onScoreRecalculated={vi.fn()} t={t} />);
    expect(html).toContain('Opening shift checklist');
    expect(html).toContain('Loading...');
    expect(html).not.toContain('92%');
  });

  it('shows the header subtitle as "date · employee" and a Recalculate button for an admin', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<SessionReportBody session={makeSession()} onScoreRecalculated={vi.fn()} t={t} />);
    expect(html).toContain('Leo Learner');
    // Distinct wording from the dialog's own submit button ("Recalculate score") so the two
    // never collide under the same accessible name once the dialog is open (PR 322).
    expect(html).toContain('>Recalculate<');
  });

  it('uses underline in-app tabs (admin-org-tabs), not the old pill buttons', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<SessionReportBody session={makeSession()} onScoreRecalculated={vi.fn()} t={t} />);
    expect(html).toContain('admin-org-tabs__tab');
  });

  it('renders the participants tab with learner and observer', () => {
    reactMocks.useState
      .mockReturnValueOnce(['participants', vi.fn()])
      .mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<SessionReportBody session={makeSession()} onScoreRecalculated={vi.fn()} t={t} />);
    expect(html).toContain('Leo Learner');
    expect(html).toContain('Olga Observer');
  });
});

describe('RecalculateDialog', () => {
  it('renders the RecalculateForm inside the shared Dialog shell', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<RecalculateDialog onClose={vi.fn()} onDone={vi.fn()} open={true} sessionId="session-1" t={t} />);
    expect(html).toContain('<dialog');
    expect(html).toContain('Reason for recalculation');
  });
});

describe('RecalculateForm', () => {
  it('offers snapshot and equal criteria formulas with the snapshot selected by default', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<RecalculateForm sessionId="session-1" onDone={vi.fn()} t={t} />);
    expect(html).toContain('value="snapshot" selected=""');
    expect(html).toContain('By criteria (marked / total)');
    expect(html).not.toContain('Skipped criteria are excluded');
    reactMocks.useState.mockImplementation((initial: unknown) => [initial === 'snapshot' ? 'criteria' : initial, vi.fn()]);
    const criteria = renderToStaticMarkup(<RecalculateForm sessionId="session-1" onDone={vi.fn()} t={t} />);
    expect(criteria).toContain('Skipped criteria are excluded');
  });
  it('shows the returned before/after and actual formula, including an unscored outcome', () => {
    let call = 0;
    reactMocks.useState.mockImplementation((initial: unknown) => [++call === 5 ? { previousPercentage: 95, newPercentage: 0, scored: false, formula: 'criteria' } : initial, vi.fn()]);
    const html = renderToStaticMarkup(<RecalculateForm sessionId="session-1" onDone={vi.fn()} t={t} />);
    expect(html).toContain('95% → Not scored');
    expect(html).toContain('Score recalculated');
    expect(html).not.toContain('95% → 0%');
  });
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
    const html = renderToStaticMarkup(<HistoryTab sessionId="session-1" t={t} />);
    expect(html).toContain('No events recorded yet.');
    expect(html).toContain('The score has never been recalculated.');
  });

  it('lists events and revisions (recalculation now happens from the header dialog, not here)', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => {
      if (typeof initial === 'object' && initial !== null && 'status' in (initial as object)) {
        return [{
          status: 'loaded',
          data: {
            events: [{ id: 'e1', organizationId: 'org-1', sessionId: 'session-1', eventType: 'score_recalculated', actorUserId: 'admin-1', metadata: null, createdAt: '2026-02-01T09:00:00.000Z' }],
            revisions: [{ id: 'r1', organizationId: 'org-1', instanceId: 'instance-1', formula: 'snapshot', newScored: true, previousPercentage: 60, newPercentage: 90, previousPassed: false, newPassed: true, reason: 'Fixing a bug', actorUserId: 'admin-1', createdAt: '2026-02-01T09:00:00.000Z' }],
          },
        }, vi.fn()];
      }
      return [initial, vi.fn()];
    });
    const html = renderToStaticMarkup(<HistoryTab sessionId="session-1" t={t} />);
    expect(html).toContain('60% → 90%');
    expect(html).toContain('Fixing a bug');
    expect(html).toContain('Checklist settings (points and weights)');
  });
});
