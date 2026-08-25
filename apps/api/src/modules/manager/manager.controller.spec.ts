import type { AuthenticatedRequest } from '../auth/auth.guard';
import { ManagerController } from './manager.controller';
import type { ManagerService } from './manager.service';

const orgId = '11111111-1111-1111-1111-111111111111';
const managerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeRequest(userId: string, roles: string[]): AuthenticatedRequest {
  return {
    currentUser: { id: userId, organizationId: orgId, roles },
  } as unknown as AuthenticatedRequest;
}

describe('ManagerController getTeamSummary', () => {
  it('passes the current user through as the actor', () => {
    const calls: unknown[] = [];
    const service = {
      getTeamSummary: (...args: unknown[]) => { calls.push(args); return {}; },
    } as unknown as ManagerService;
    const controller = new ManagerController(service);

    controller.getTeamSummary(makeRequest(managerId, ['manager']));

    expect(calls).toEqual([[{ id: managerId, organizationId: orgId, roles: ['manager'] }]]);
  });

  it('validates reminder ids and passes the authenticated actor to the service', () => {
    const calls: unknown[] = [];
    const assignmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const service = {
      sendOverdueReminders: (...args: unknown[]) => { calls.push(args); return {}; },
    } as unknown as ManagerService;
    const controller = new ManagerController(service);

    controller.sendOverdueReminders({ assignmentIds: [assignmentId] }, makeRequest(managerId, ['manager']));

    expect(calls).toEqual([[{ id: managerId, organizationId: orgId, roles: ['manager'] }, [assignmentId]]]);
    expect(() => controller.sendOverdueReminders({ assignmentIds: [] }, makeRequest(managerId, ['manager']))).toThrow();
  });
});
