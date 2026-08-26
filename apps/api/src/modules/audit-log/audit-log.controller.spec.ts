import type { AuthenticatedRequest } from '../auth/public.js';
import { AuditLogController } from './audit-log.controller.js';
import type { AuditLogService } from './audit-log.service.js';

describe('AuditLogController', () => {
  it('scopes list() to the authenticated actor organization and parses the query', () => {
    const actor = { id: 'admin-1', organizationId: 'org-1', roles: ['admin'] as const };
    const calls: unknown[] = [];
    const list = (...args: unknown[]) => { calls.push(args); };
    const controller = new AuditLogController({ list } as unknown as AuditLogService);

    controller.list({ currentUser: actor } as unknown as AuthenticatedRequest, { page: '2', pageSize: '10', action: 'course.created' });

    expect(calls).toEqual([['org-1', { page: 2, pageSize: 10, action: 'course.created' }]]);
  });

  it('scopes listFilterOptions() to the authenticated actor organization', () => {
    const actor = { id: 'admin-1', organizationId: 'org-1', roles: ['admin'] as const };
    const calls: unknown[] = [];
    const listFilterOptions = (...args: unknown[]) => { calls.push(args); };
    const controller = new AuditLogController({ listFilterOptions } as unknown as AuditLogService);

    controller.listFilterOptions({ currentUser: actor } as unknown as AuthenticatedRequest);

    expect(calls).toEqual([['org-1']]);
  });
});
