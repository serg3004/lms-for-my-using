import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ManagerChecklistAnalytics } from '../shared/api/manager.js';

const reactMocks = vi.hoisted(() => ({ useState: vi.fn() }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useState: reactMocks.useState };
});

const apiMocks = vi.hoisted(() => ({ getManagerChecklistAnalytics: vi.fn(), listChecklists: vi.fn(), listChecklistSessions: vi.fn() }));
vi.mock('../shared/api/manager.js', async () => {
  const actual = await vi.importActual<typeof import('../shared/api/manager.js')>('../shared/api/manager.js');
  return { ...actual, getManagerChecklistAnalytics: apiMocks.getManagerChecklistAnalytics };
});
vi.mock('../shared/api/checklists.js', () => ({ listChecklists: apiMocks.listChecklists }));
vi.mock('../shared/api/checklistSessions.js', () => ({ listChecklistSessions: apiMocks.listChecklistSessions }));

import { DistributionDonut, EmployeeSessionsDrilldown, ManagerChecklistsPage, resolvePeriodRange, TrendLine } from './ManagerChecklistsPage.js';

const t = ((key: string, fallback?: string, params?: Record<string, unknown>) => {
  const text = fallback ?? key;
  return params ? text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? '')) : text;
}) as unknown as TFunction;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolvePeriodRange', () => {
  const now = new Date('2026-02-28T12:00:00.000Z');

  it('resolves week/month/quarter to a rolling window ending now', () => {
    expect(resolvePeriodRange('week', now, '', '').to).toBe(now.toISOString());
    expect(new Date(resolvePeriodRange('week', now, '', '').from).getTime()).toBe(now.getTime() - 7 * 86_400_000);
    expect(new Date(resolvePeriodRange('quarter', now, '', '').from).getTime()).toBe(now.getTime() - 90 * 86_400_000);
  });

  it('uses the explicit bounds for a custom period', () => {
    const range = resolvePeriodRange('custom', now, '2026-01-01', '2026-01-15');
    expect(range).toEqual({ from: new Date('2026-01-01').toISOString(), to: new Date('2026-01-15').toISOString() });
  });

  it('falls back to a month window when custom is selected without bounds', () => {
    const range = resolvePeriodRange('custom', now, '', '');
    expect(new Date(range.from).getTime()).toBe(now.getTime() - 30 * 86_400_000);
  });
});

const analyticsFixture: ManagerChecklistAnalytics = {
  summary: { totalEmployees: 2, totalSessions: 5, completedSessions: 4, averagePercentage: 78, lowCount: 1, highCount: 2, noCompletionCount: 1 },
  thresholds: { high: 90, low: 60 },
  distribution: [{ bucket: 'low', count: 1 }, { bucket: 'mid', count: 1 }, { bucket: 'high', count: 2 }],
  trend: [{ date: '2026-02-05', averagePercentage: 70, count: 1 }, { date: '2026-02-10', averagePercentage: 86, count: 2 }],
  employees: [
    { userId: 'u1', firstName: 'Alex', lastName: 'Kim', department: 'Warehouse', sessionsCount: 3, completedCount: 3, averagePercentage: 85, trend: 'up', lastSessionAt: '2026-02-10T00:00:00.000Z' },
    { userId: 'u2', firstName: 'Mira', lastName: 'Lee', department: null, sessionsCount: 0, completedCount: 0, averagePercentage: null, trend: null, lastSessionAt: null },
  ],
};

describe('ManagerChecklistsPage', () => {
  it('renders the loading shell without crashing while wrapped in a router', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<MemoryRouter><ManagerChecklistsPage /></MemoryRouter>);
    expect(html).toContain('Аналитика чек-листов');
  });

  it('renders summary cards, distribution, trend, and the employee table once loaded', () => {
    reactMocks.useState
      .mockReturnValueOnce([new Set(), vi.fn()])
      .mockReturnValueOnce([{ status: 'loaded', data: analyticsFixture }, vi.fn()])
      .mockReturnValueOnce([{ status: 'loaded', data: [] }, vi.fn()])
      .mockImplementation((initial: unknown) => [initial, vi.fn()]);

    const html = renderToStaticMarkup(<MemoryRouter><ManagerChecklistsPage /></MemoryRouter>);

    expect(html).toContain('78%');
    expect(html).toContain('Alex Kim');
    expect(html).toContain('Mira Lee');
    expect(html).toContain('Warehouse');
  });

  it('shows the custom period date inputs when ?period=custom is in the URL', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/manager/checklists?period=custom']}><ManagerChecklistsPage /></MemoryRouter>,
    );
    expect(html).toContain('type="date"');
  });
});

describe('DistributionDonut', () => {
  it('renders the donut chart with bucket counts by default', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<DistributionDonut distribution={analyticsFixture.distribution} t={t} />);
    expect(html).toContain('<svg');
    expect(html).toContain('Low');
    expect(html).toContain('High');
  });

  it('renders a table view as the accessible equivalent', () => {
    reactMocks.useState.mockReturnValueOnce(['table', vi.fn()]).mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<DistributionDonut distribution={analyticsFixture.distribution} t={t} />);
    expect(html).toContain('<table');
    expect(html).not.toContain('<svg');
  });
});

describe('TrendLine', () => {
  it('renders an empty state when there is no trend data', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<TrendLine trend={[]} t={t} />);
    expect(html).toContain('No completed sessions in this period yet.');
  });

  it('renders a polyline for a non-empty trend', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<TrendLine trend={analyticsFixture.trend} t={t} />);
    expect(html).toContain('<path');
  });

  it('renders a table view as the accessible equivalent', () => {
    reactMocks.useState.mockReturnValueOnce(['table', vi.fn()]).mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<TrendLine trend={analyticsFixture.trend} t={t} />);
    expect(html).toContain('2026-02-05');
    expect(html).toContain('70%');
  });
});

describe('EmployeeSessionsDrilldown', () => {
  it('shows an empty message when the employee has no sessions in the period', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => {
      if (typeof initial === 'object' && initial !== null && 'status' in (initial as object)) return [{ status: 'loaded', data: [] }, vi.fn()];
      return [initial, vi.fn()];
    });
    const html = renderToStaticMarkup(<EmployeeSessionsDrilldown userId="u2" from="2026-02-01T00:00:00.000Z" to="2026-02-28T00:00:00.000Z" t={t} />);
    expect(html).toContain('No sessions for this employee in the selected period.');
  });

  it('lists each session with checklist title, date, and result', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => {
      if (typeof initial === 'object' && initial !== null && 'status' in (initial as object)) {
        return [{
          status: 'loaded',
          data: [{
            id: 's1', organizationId: 'org-1', instanceId: 'i1', observerId: 'o1', status: 'completed', version: 1,
            scheduledAt: '2026-02-10T09:00:00.000Z', startedAt: null, pausedAt: null, locationCapturePolicy: 'off', timezone: 'UTC', overdue: false,
            strengths: null, developmentAreas: null, nextSteps: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
            checklist: { id: 'c1', title: 'Opening shift checklist' },
            learner: { id: 'u1', firstName: 'Alex', lastName: 'Kim', email: 'alex@example.invalid' },
            observer: { id: 'o1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
            result: { instanceStatus: 'completed', percentage: 85, passed: true, scored: true, visible: true },
          }],
        }, vi.fn()];
      }
      return [initial, vi.fn()];
    });
    const html = renderToStaticMarkup(<EmployeeSessionsDrilldown userId="u1" from="2026-02-01T00:00:00.000Z" to="2026-02-28T00:00:00.000Z" t={t} />);
    expect(html).toContain('Opening shift checklist');
    expect(html).toContain('85%');
  });
});
