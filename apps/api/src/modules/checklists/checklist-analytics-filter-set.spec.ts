import { jest } from '@jest/globals';

import { ChecklistAnalyticsFilters } from './checklist-analytics-filter-set.js';
import { analyticsEmployeeFilter } from './checklist-sheet-analytics.js';
import { checklistAnalyticsFilterSetSchema, checklistSheetAnalyticsQuerySchema } from './checklists.schemas.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('analytics filter set (PR 518)', () => {
  it('reads several departments and employees from a comma separated list', () => {
    const parsed = checklistSheetAnalyticsQuerySchema.parse({ from: '2026-11-01T00:00:00Z', to: '2026-11-30T00:00:00Z', departmentIds: `${A},${B.toUpperCase()}`, employeeIds: A });
    expect(parsed.departmentIds).toEqual([A, B]);
    expect(parsed.employeeIds).toEqual([A]);
  });

  it('narrows the employee scope by the picked employees and departments', () => {
    const filter = analyticsEmployeeFilter('org', {}, { employeeIds: [A], departmentIds: [B] }) as { AND: Array<Record<string, unknown>> };
    expect(filter.AND).toContainEqual({ id: { in: [A] } });
    expect(JSON.stringify(filter.AND)).toContain('"departmentId":{"in":["' + B + '"]}');
  });

  it('accepts only known, unique filter keys', () => {
    expect(checklistAnalyticsFilterSetSchema.parse({ filters: ['sheets', 'period'] }).scope).toBe('user');
    expect(() => checklistAnalyticsFilterSetSchema.parse({ filters: ['sheets', 'sheets'] })).toThrow();
    expect(() => checklistAnalyticsFilterSetSchema.parse({ filters: ['nope'] })).toThrow();
  });

  function build() {
    const rows: Array<{ ownerKey: string; filters: string[] }> = [];
    const prisma = {
      checklistAnalyticsFilterSet: {
        findMany: jest.fn(async () => rows),
        deleteMany: jest.fn(async ({ where }: { where: { ownerKey: string } }) => { const i = rows.findIndex((r) => r.ownerKey === where.ownerKey); if (i >= 0) rows.splice(i, 1); }),
        upsert: jest.fn(async ({ create, update, where }: { create: { ownerKey: string; filters: string[] }; update: { filters: string[] }; where: { organizationId_ownerKey: { ownerKey: string } } }) => {
          const row = rows.find((r) => r.ownerKey === where.organizationId_ownerKey.ownerKey);
          if (row) row.filters = update.filters; else rows.push({ ownerKey: create.ownerKey, filters: create.filters });
        }),
      },
    };
    return { service: new ChecklistAnalyticsFilters(prisma as never), rows };
  }
  const forbidden = (): never => { throw new Error('forbidden'); };

  it('keeps a set per user and an organization default that only an administrator may write', async () => {
    const { service } = build();
    await expect(service.saveSet('org', { id: 'u1', roles: ['manager'] }, { filters: ['sheets'], scope: 'organization' }, forbidden)).rejects.toThrow('forbidden');
    await service.saveSet('org', { id: 'a1', roles: ['admin'] }, { filters: ['period', 'sheets'], scope: 'organization' }, forbidden);
    const own = await service.saveSet('org', { id: 'u1', roles: ['manager'] }, { filters: ['employee'], scope: 'user' }, forbidden);
    expect(own).toEqual({ user: ['employee'], organization: ['period', 'sheets'] });
    const reset = await service.saveSet('org', { id: 'u1', roles: ['manager'] }, { filters: [], scope: 'user' }, forbidden);
    expect(reset.user).toBeNull();
  });
});
