import type { AuthenticatedRequest } from '../auth/auth.guard';
import { ProgressController } from './progress.controller';
import type { ProgressService } from './progress.service';

const orgId = '11111111-1111-1111-1111-111111111111';
const learnerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const adminId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const courseId = '22222222-2222-4222-8222-222222222222';
const otherUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const targetUserId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function makeRequest(userId: string, roles: string[]): AuthenticatedRequest {
  return {
    currentUser: { id: userId, organizationId: orgId, roles },
  } as unknown as AuthenticatedRequest;
}

describe('ProgressController — RBAC ownership', () => {
  describe('listProgress', () => {
    it('passes userId filter for learner-only role', () => {
      const calls: unknown[] = [];
      const service = {
        listProgress: (...args: unknown[]) => { calls.push(args); return []; },
      } as unknown as ProgressService;
      const controller = new ProgressController(service);

      controller.listProgress(makeRequest(learnerId, ['learner']), {});

      expect(calls).toEqual([[orgId, learnerId, 1, 20]]);
    });

    it('passes no userId filter for admin role', () => {
      const calls: unknown[] = [];
      const service = {
        listProgress: (...args: unknown[]) => { calls.push(args); return []; },
      } as unknown as ProgressService;
      const controller = new ProgressController(service);

      controller.listProgress(makeRequest(adminId, ['admin']), {});

      expect(calls).toEqual([[orgId, undefined, 1, 20]]);
    });

    it('passes no userId filter when user has both learner and instructor roles', () => {
      const calls: unknown[] = [];
      const service = {
        listProgress: (...args: unknown[]) => { calls.push(args); return []; },
      } as unknown as ProgressService;
      const controller = new ProgressController(service);

      controller.listProgress(makeRequest(learnerId, ['learner', 'instructor']), {});

      expect(calls).toEqual([[orgId, undefined, 1, 20]]);
    });
  });

  describe('getProgress', () => {
    it('passes userId filter for learner-only role', () => {
      const calls: unknown[] = [];
      const service = {
        getProgress: (...args: unknown[]) => { calls.push(args); return {}; },
      } as unknown as ProgressService;
      const controller = new ProgressController(service);

      controller.getProgress('progress-id', makeRequest(learnerId, ['learner']));

      expect(calls).toEqual([['progress-id', orgId, learnerId]]);
    });

    it('passes no userId filter for admin role', () => {
      const calls: unknown[] = [];
      const service = {
        getProgress: (...args: unknown[]) => { calls.push(args); return {}; },
      } as unknown as ProgressService;
      const controller = new ProgressController(service);

      controller.getProgress('progress-id', makeRequest(adminId, ['admin']));

      expect(calls).toEqual([['progress-id', orgId, undefined]]);
    });
  });

  describe('createProgress — ownership enforcement', () => {
    it('overrides userId with currentUser.id for learner-only role', () => {
      const calls: unknown[] = [];
      const service = {
        createProgress: (...args: unknown[]) => { calls.push(args); return {}; },
      } as unknown as ProgressService;
      const controller = new ProgressController(service);
      const body = {
        organizationId: orgId,
        courseId,
        userId: otherUserId,
      };

      controller.createProgress(body, makeRequest(learnerId, ['learner']));

      const createdInput = (calls[0] as unknown[])[0] as Record<string, unknown>;
      expect(createdInput['userId']).toBe(learnerId);
    });

    it('preserves userId from body for admin role', () => {
      const calls: unknown[] = [];
      const service = {
        createProgress: (...args: unknown[]) => { calls.push(args); return {}; },
      } as unknown as ProgressService;
      const controller = new ProgressController(service);
      const body = {
        organizationId: orgId,
        courseId,
        userId: targetUserId,
      };

      controller.createProgress(body, makeRequest(adminId, ['admin']));

      const createdInput = (calls[0] as unknown[])[0] as Record<string, unknown>;
      expect(createdInput['userId']).toBe(targetUserId);
    });
  });
});
