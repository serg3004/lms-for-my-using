import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { ChecklistsService } from './checklists.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const thresholds = { high: 90, low: 60 };

type Employee = { id: string; firstName: string; lastName: string; departmentName?: string | null; departmentId?: string };
type SessionRow = {
  userId: string;
  scheduledAt: string;
  status?: 'completed' | 'in_progress' | 'assigned';
  percentage?: number;
  passed?: boolean;
  scored?: boolean;
};

type SelfRow = { userId: string; completedAt: string; percentage: number; passed?: boolean };

function createHarness(options: { employees: Employee[]; currentSessions?: SessionRow[]; previousSessions?: SessionRow[]; currentSelf?: SelfRow[]; previousSelf?: SelfRow[] }) {
  const currentSessions = options.currentSessions ?? [];
  const previousSessions = options.previousSessions ?? [];

  const toRow = (row: SessionRow) => ({
    scheduledAt: new Date(row.scheduledAt),
    instance: {
      userId: row.userId,
      status: row.status ?? 'completed',
      percentage: row.percentage ?? 0,
      passed: row.passed ?? false,
      scored: row.scored ?? true,
    },
  });

  const findMany = jest.fn(async () => {
    // The service issues exactly two findMany calls, in order: current window first, previous window second.
    return findMany.mock.calls.length <= 1 ? currentSessions.map(toRow) : previousSessions.map(toRow);
  });

  // PR 380: self-completed results (no session), also read current window first and previous second.
  const findSelf = jest.fn(async () => (findSelf.mock.calls.length <= 1 ? options.currentSelf ?? [] : options.previousSelf ?? []).map((row) => ({
    userId: row.userId, status: 'completed', percentage: row.percentage, passed: row.passed ?? false, scored: true, completedAt: new Date(row.completedAt),
  })));

  const prisma = {
    user: {
      findMany: jest.fn(async () => options.employees.map((employee) => ({
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: `${employee.id}@example.test`,
        departmentMemberships: employee.departmentName === undefined ? [] : [{ department: { id: employee.departmentId ?? `dept-${employee.departmentName}`, name: employee.departmentName } }],
      }))),
    },
    checklistSession: { findMany },
    checklistInstance: { findMany: findSelf },
  } as unknown as PrismaService;

  return { service: new ChecklistsService(prisma), prisma, findMany, findSelf };
}

const query = { from: '2026-02-01T00:00:00.000Z', to: '2026-02-28T00:00:00.000Z' };

describe('ChecklistsService.getManagerAnalytics (PR 299)', () => {
  it('returns zeroed aggregates when the manager has no employees in scope', async () => {
    const { service } = createHarness({ employees: [] });

    const result = await service.getManagerAnalytics(organizationId, query, {}, thresholds);

    expect(result.summary).toEqual({
      totalEmployees: 0, totalSessions: 0, completedSessions: 0, selfCompletedCount: 0, averagePercentage: 0, lowCount: 0, highCount: 0, noCompletionCount: 0,
    });
    expect(result.employees).toEqual([]);
    expect(result.trend).toEqual([]);
  });

  it('keeps an employee with zero sessions in the period, counting them toward noCompletionCount', async () => {
    const { service } = createHarness({ employees: [{ id: 'u1', firstName: 'A', lastName: 'One' }] });

    const result = await service.getManagerAnalytics(organizationId, query, {}, thresholds);

    expect(result.summary.totalEmployees).toBe(1);
    expect(result.summary.noCompletionCount).toBe(1);
    expect(result.employees).toEqual([
      expect.objectContaining({ userId: 'u1', sessionsCount: 0, completedCount: 0, averagePercentage: null, trend: null, lastSessionAt: null }),
    ]);
  });

  it('buckets completed+scored sessions into low/mid/high using the configured thresholds', async () => {
    const { service } = createHarness({
      employees: [{ id: 'u1', firstName: 'A', lastName: 'One' }],
      currentSessions: [
        { userId: 'u1', scheduledAt: '2026-02-05T00:00:00.000Z', percentage: 40, passed: false },
        { userId: 'u1', scheduledAt: '2026-02-10T00:00:00.000Z', percentage: 75, passed: true },
        { userId: 'u1', scheduledAt: '2026-02-15T00:00:00.000Z', percentage: 95, passed: true },
      ],
    });

    const result = await service.getManagerAnalytics(organizationId, query, {}, thresholds);

    expect(result.distribution).toEqual(expect.arrayContaining([
      { bucket: 'low', count: 1 },
      { bucket: 'mid', count: 1 },
      { bucket: 'high', count: 1 },
    ]));
    expect(result.summary.lowCount).toBe(1);
    expect(result.summary.highCount).toBe(1);
    expect(result.summary.averagePercentage).toBe(Math.round((40 + 75 + 95) / 3));
  });

  it('falls back to the instance passed flag for low/mid when lowThreshold is unset (DEC-CHKS-001)', async () => {
    const { service } = createHarness({
      employees: [{ id: 'u1', firstName: 'A', lastName: 'One' }],
      currentSessions: [
        { userId: 'u1', scheduledAt: '2026-02-05T00:00:00.000Z', percentage: 55, passed: false },
        { userId: 'u1', scheduledAt: '2026-02-10T00:00:00.000Z', percentage: 80, passed: true },
      ],
    });

    const result = await service.getManagerAnalytics(organizationId, query, {}, { high: 90, low: null });

    expect(result.distribution).toEqual(expect.arrayContaining([
      { bucket: 'low', count: 1 },
      { bucket: 'mid', count: 1 },
      { bucket: 'high', count: 0 },
    ]));
  });

  it('bands an employee by the average against the thresholds, boundaries included (PR 350)', async () => {
    const { service } = createHarness({
      employees: [
        { id: 'u1', firstName: 'A', lastName: 'AtLow' },
        { id: 'u2', firstName: 'B', lastName: 'BelowLow' },
        { id: 'u3', firstName: 'C', lastName: 'AtHigh' },
        { id: 'u4', firstName: 'D', lastName: 'None' },
      ],
      currentSessions: [
        { userId: 'u1', scheduledAt: '2026-02-05T00:00:00.000Z', percentage: 60, passed: true },
        { userId: 'u2', scheduledAt: '2026-02-05T00:00:00.000Z', percentage: 59, passed: true },
        { userId: 'u3', scheduledAt: '2026-02-05T00:00:00.000Z', percentage: 90, passed: true },
      ],
    });

    const result = await service.getManagerAnalytics(organizationId, query, {}, thresholds);
    const bandOf = (id: string) => result.employees.find((employee) => employee.userId === id)?.performance;

    expect(bandOf('u1')).toBe('mid');
    expect(bandOf('u2')).toBe('low');
    expect(bandOf('u3')).toBe('high');
    expect(bandOf('u4')).toBeNull();
  });

  it('gives no low band to employees while lowThreshold is unset', async () => {
    const { service } = createHarness({
      employees: [{ id: 'u1', firstName: 'A', lastName: 'One' }],
      currentSessions: [{ userId: 'u1', scheduledAt: '2026-02-05T00:00:00.000Z', percentage: 10, passed: false }],
    });

    const result = await service.getManagerAnalytics(organizationId, query, {}, { high: 90, low: null });

    expect(result.employees[0]?.performance).toBe('mid');
  });

  it('excludes not-yet-completed and unscored sessions from percentage-based stats but keeps them in sessionsCount', async () => {
    const { service } = createHarness({
      employees: [{ id: 'u1', firstName: 'A', lastName: 'One' }],
      currentSessions: [
        { userId: 'u1', scheduledAt: '2026-02-05T00:00:00.000Z', status: 'in_progress', percentage: 0 },
        { userId: 'u1', scheduledAt: '2026-02-06T00:00:00.000Z', status: 'completed', scored: false, percentage: 0 },
        { userId: 'u1', scheduledAt: '2026-02-07T00:00:00.000Z', status: 'completed', percentage: 80, passed: true },
      ],
    });

    const result = await service.getManagerAnalytics(organizationId, query, {}, thresholds);

    expect(result.employees[0]).toMatchObject({ sessionsCount: 3, completedCount: 1, averagePercentage: 80 });
    expect(result.summary.totalSessions).toBe(3);
    expect(result.summary.completedSessions).toBe(2);
  });

  it('counts results the employee finished on their own next to sessions, without inflating the session count (PR 380)', async () => {
    const { service, findSelf } = createHarness({
      employees: [{ id: 'u1', firstName: 'A', lastName: 'One' }, { id: 'u2', firstName: 'B', lastName: 'Two' }],
      currentSessions: [{ userId: 'u1', scheduledAt: '2026-02-07T00:00:00.000Z', percentage: 80, passed: true }],
      currentSelf: [
        { userId: 'u1', completedAt: '2026-02-08T00:00:00.000Z', percentage: 100, passed: true },
        { userId: 'u2', completedAt: '2026-02-09T00:00:00.000Z', percentage: 40, passed: false },
      ],
    });

    const result = await service.getManagerAnalytics(organizationId, query, {}, thresholds);

    expect(result.summary).toMatchObject({ totalSessions: 1, completedSessions: 1, selfCompletedCount: 2, averagePercentage: 73, lowCount: 1, noCompletionCount: 0 });
    expect(result.employees.find((row) => row.userId === 'u1')).toMatchObject({ sessionsCount: 1, completedCount: 2, averagePercentage: 90 });
    expect(result.employees.find((row) => row.userId === 'u2')).toMatchObject({ sessionsCount: 0, completedCount: 1, averagePercentage: 40 });
    expect(result.trend.map((point) => point.date)).toEqual(['2026-02-07', '2026-02-08', '2026-02-09']);
    expect(findSelf.mock.calls[0]?.[0]).toMatchObject({ where: { session: { is: null }, status: 'completed', userId: { in: ['u1', 'u2'] } } });
  });

  it('computes an up/down/flat trend by comparing the current window average against the equal-length previous window', async () => {
    const { service } = createHarness({
      employees: [
        { id: 'u-up', firstName: 'Up', lastName: 'Trend' },
        { id: 'u-down', firstName: 'Down', lastName: 'Trend' },
        { id: 'u-flat', firstName: 'Flat', lastName: 'Trend' },
      ],
      currentSessions: [
        { userId: 'u-up', scheduledAt: '2026-02-10T00:00:00.000Z', percentage: 80, passed: true },
        { userId: 'u-down', scheduledAt: '2026-02-10T00:00:00.000Z', percentage: 40, passed: false },
        { userId: 'u-flat', scheduledAt: '2026-02-10T00:00:00.000Z', percentage: 70, passed: true },
      ],
      previousSessions: [
        { userId: 'u-up', scheduledAt: '2026-01-10T00:00:00.000Z', percentage: 50, passed: false },
        { userId: 'u-down', scheduledAt: '2026-01-10T00:00:00.000Z', percentage: 90, passed: true },
        { userId: 'u-flat', scheduledAt: '2026-01-10T00:00:00.000Z', percentage: 70, passed: true },
      ],
    });

    const result = await service.getManagerAnalytics(organizationId, query, {}, thresholds);

    const trendByUser = Object.fromEntries(result.employees.map((row) => [row.userId, row.trend]));
    expect(trendByUser).toEqual({ 'u-up': 'up', 'u-down': 'down', 'u-flat': 'flat' });
  });

  it('applies the manager scope to the employee lookup and never widens it by department', async () => {
    const { service, prisma } = createHarness({ employees: [] });
    const findManyUsers = jest.spyOn(prisma.user, 'findMany');
    const managerScope = { id: { in: ['a', 'b'] } };

    await service.getManagerAnalytics(organizationId, { ...query, departmentId: 'dept-1' }, managerScope, thresholds);

    expect(findManyUsers).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId, deletedAt: null, ...managerScope }),
    }));
  });

  it('filters rows by department but keeps the department options and breakdown of the whole zone', async () => {
    const { service } = createHarness({
      employees: [
        { id: 'u1', firstName: 'A', lastName: 'One', departmentName: 'Кухня' },
        { id: 'u2', firstName: 'B', lastName: 'Two', departmentName: 'Зал' },
        { id: 'u3', firstName: 'C', lastName: 'Three' },
      ],
      currentSessions: [
        { userId: 'u1', scheduledAt: '2026-02-10T00:00:00.000Z', percentage: 80, passed: true },
        { userId: 'u2', scheduledAt: '2026-02-11T00:00:00.000Z', percentage: 40, passed: false },
      ],
    });

    const result = await service.getManagerAnalytics(organizationId, { ...query, departmentId: 'dept-Кухня' }, {}, thresholds);

    expect(result.employees.map((row) => row.userId)).toEqual(['u1']);
    expect(result.summary.totalEmployees).toBe(1);
    expect(result.summary.totalSessions).toBe(1);
    expect(result.departmentOptions).toEqual([{ id: 'dept-Зал', name: 'Зал' }, { id: 'dept-Кухня', name: 'Кухня' }]);
    expect(result.departments).toEqual([
      { departmentId: 'dept-Зал', name: 'Зал', employeesCount: 1, sessionsCount: 1, completedCount: 1, averagePercentage: 40, noCompletionCount: 0 },
      { departmentId: 'dept-Кухня', name: 'Кухня', employeesCount: 1, sessionsCount: 1, completedCount: 1, averagePercentage: 80, noCompletionCount: 0 },
    ]);
  });

  it('returns null averages for departments without completed sessions', async () => {
    const { service } = createHarness({ employees: [{ id: 'u1', firstName: 'A', lastName: 'One', departmentName: 'Склад' }] });

    const result = await service.getManagerAnalytics(organizationId, query, {}, thresholds);

    expect(result.departments).toEqual([
      { departmentId: 'dept-Склад', name: 'Склад', employeesCount: 1, sessionsCount: 0, completedCount: 0, averagePercentage: null, noCompletionCount: 1 },
    ]);
  });

  it('reports a deterministic day-bucketed trend time series ordered chronologically', async () => {
    const { service } = createHarness({
      employees: [{ id: 'u1', firstName: 'A', lastName: 'One' }],
      currentSessions: [
        { userId: 'u1', scheduledAt: '2026-02-10T08:00:00.000Z', percentage: 60, passed: true },
        { userId: 'u1', scheduledAt: '2026-02-10T18:00:00.000Z', percentage: 80, passed: true },
        { userId: 'u1', scheduledAt: '2026-02-05T00:00:00.000Z', percentage: 100, passed: true },
      ],
    });

    const result = await service.getManagerAnalytics(organizationId, query, {}, thresholds);

    expect(result.trend).toEqual([
      { date: '2026-02-05', averagePercentage: 100, count: 1 },
      { date: '2026-02-10', averagePercentage: 70, count: 2 },
    ]);
  });
});

describe('manager breakdown export limit (PR 356)', () => {
  it('rejects more than 5000 manager rows without truncating the table', async () => {
    const { service } = createHarness({ employees: [] });
    jest.spyOn(service, 'getManagerAnalytics').mockResolvedValue({ managers: Array.from({ length: 5001 }, (_, index) => ({ managerId: String(index), name: 'Leader', employeesCount: 1, completedCount: 0, averagePercentage: null })) } as never);
    await expect(service.exportManagerAnalytics(organizationId, { ...query, table: 'managers' }, {}, thresholds, { id: 'actor', locale: 'en' })).rejects.toThrow('limited to 5000 managers');
  });
});
