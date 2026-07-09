import type { AuthenticatedRequest } from '../auth/auth.guard';
import { AssignmentsController } from './assignments.controller';
import type { AssignmentsService } from './assignments.service';

const orgId = '11111111-1111-1111-1111-111111111111';
const learnerId = 'learner-user-id';
const adminId = 'admin-user-id';

function makeRequest(userId: string, roles: string[]): AuthenticatedRequest {
  return {
    currentUser: { id: userId, organizationId: orgId, roles },
  } as unknown as AuthenticatedRequest;
}

describe('AssignmentsController — RBAC ownership', () => {
  describe('listAssignments', () => {
    it('passes userId filter for learner-only role', () => {
      const calls: unknown[] = [];
      const service = {
        listAssignments: (...args: unknown[]) => { calls.push(args); return []; },
      } as unknown as AssignmentsService;
      const controller = new AssignmentsController(service);

      controller.listAssignments(makeRequest(learnerId, ['learner']), {});

      expect(calls).toEqual([[orgId, learnerId, 1, 20]]);
    });

    it('passes no userId filter for admin role', () => {
      const calls: unknown[] = [];
      const service = {
        listAssignments: (...args: unknown[]) => { calls.push(args); return []; },
      } as unknown as AssignmentsService;
      const controller = new AssignmentsController(service);

      controller.listAssignments(makeRequest(adminId, ['admin']), {});

      expect(calls).toEqual([[orgId, undefined, 1, 20]]);
    });

    it('passes no userId filter for manager role', () => {
      const calls: unknown[] = [];
      const service = {
        listAssignments: (...args: unknown[]) => { calls.push(args); return []; },
      } as unknown as AssignmentsService;
      const controller = new AssignmentsController(service);

      controller.listAssignments(makeRequest(adminId, ['manager']), {});

      expect(calls).toEqual([[orgId, undefined, 1, 20]]);
    });

    it('passes no userId filter when user has both learner and instructor roles', () => {
      const calls: unknown[] = [];
      const service = {
        listAssignments: (...args: unknown[]) => { calls.push(args); return []; },
      } as unknown as AssignmentsService;
      const controller = new AssignmentsController(service);

      controller.listAssignments(makeRequest(learnerId, ['learner', 'instructor']), {});

      expect(calls).toEqual([[orgId, undefined, 1, 20]]);
    });
  });
});
