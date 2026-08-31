import type { AuthenticatedRequest } from '../auth/public.js';
import { ReportsController } from './reports.controller.js';
import type { ReportsService } from './reports.service.js';

describe('ReportsController', () => {
  it('passes the authenticated actor to the reports service, with no department filter by default', () => {
    const actor = { id: 'admin-1', organizationId: 'org-1', roles: ['admin'] as const };
    const calls: unknown[] = [];
    const getSummary = (...args: unknown[]) => { calls.push(args); };
    const controller = new ReportsController({ getSummary } as unknown as ReportsService);

    controller.getSummary({}, { currentUser: actor } as unknown as AuthenticatedRequest);

    expect(calls).toEqual([[actor, undefined]]);
  });

  it('parses departmentId and includeDescendants from the query string into the filter', () => {
    const actor = { id: 'admin-1', organizationId: 'org-1', roles: ['admin'] as const };
    const calls: unknown[] = [];
    const getSummary = (...args: unknown[]) => { calls.push(args); };
    const controller = new ReportsController({ getSummary } as unknown as ReportsService);
    const departmentId = '11111111-1111-4111-8111-111111111111';

    controller.getSummary(
      { departmentId, includeDescendants: 'true' },
      { currentUser: actor } as unknown as AuthenticatedRequest,
    );

    expect(calls).toEqual([[actor, { departmentId, includeDescendants: true }]]);
  });

  it('passes the authenticated admin to the dashboard aggregate service', () => {
    const actor = { id: 'admin-1', organizationId: 'org-1', roles: ['admin'] as const };
    const calls: unknown[] = [];
    const getAdminDashboard = (value: unknown) => { calls.push(value); };
    const controller = new ReportsController({ getAdminDashboard } as unknown as ReportsService);

    controller.getAdminDashboard({ currentUser: actor } as unknown as AuthenticatedRequest);

    expect(calls).toEqual([actor]);
  });
});
