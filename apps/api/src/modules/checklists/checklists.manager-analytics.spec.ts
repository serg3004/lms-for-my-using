import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { ChecklistsService } from './checklists.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const thresholds = { high: 90, low: 60 };

type Employee = { id: string; firstName: string; lastName: string; departmentName?: string | null };
type SessionRow = {
  userId: string;
  scheduledAt: string;
  status?: 'completed' | 'in_progress' | 'assigned';
  percentage?: number;
  passed?: boolean;
  scored?: boolean;
};

function createHarness(options: { employees: Employee[]; currentSessions?: SessionRow[]; previousSessions?: SessionRow[] }) {
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

  const findMany = jest.fn(async ({ where }: { where: { scheduledAt: { gte: Date; lte: Date } } }) => {
    // The service issues exactly two findMany calls: current window first, previous window second.
    // Distinguish them by which fixture range the `gte` falls into rather than call order, so a
    // future reordering in the service can't silently make this test pass for the wrong reason.
    return findMany.mock.calls.length <= 1 ? currentSessions.map(toRow) : previousSessions.map(toRow);
  });

  const prisma = {
    user: {
      findMany: jest.fn(async () => options.employees.map((employee) => ({
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        departmentMemberships: employee.departmentName === undefined ? [] : [{ department: { name: employee.departmentName } }],
      }))),
    },
    checklistSession: { findMany },
  } as unknown as PrismaService;

  return { service: new ChecklistsService(prisma), prisma, findMany };
}

const query = { from: '2026-02-01T00:00:00.000Z', to: '2026-02-28T00:00:00.000Z' };

describe('ChecklistsService.getManagerAnalytics (PR 299)', () => {
  it('returns zeroed aggregates when the manager has no employees in scope', async () => {
    const { service } = createHarness({ employees: [] });

    const result = await service.getManagerAnalytics(organizationId, query, {}, thresholds);

    expect(result.summary).toEqual({
      totalEmployees: 0, totalSessions: 0, completedSessions: 0, averagePercentage: 0, lowCount: 0, highCount: 0, noCompletionCount: 0,
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

  it('applies the manager scope and department filter to the employee lookup', async () => {
    const { service, prisma } = createHarness({ employees: [] });
    const findManyUsers = jest.spyOn(prisma.user, 'findMany');
    const managerScope = { id: { in: ['a', 'b'] } };

    await service.getManagerAnalytics(organizationId, { ...query, departmentId: 'dept-1' }, managerScope, thresholds);

    expect(findManyUsers).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        deletedAt: null,
        ...managerScope,
        departmentMemberships: { some: { organizationId, departmentId: 'dept-1', isPrimary: true, effectiveTo: null } },
      }),
    }));
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
