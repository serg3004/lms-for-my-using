import type { AuthenticatedRequest } from '../auth/public.js';
import { LearnerDashboardController } from './learner-dashboard.controller.js';
import type { LearnerDashboardService } from './learner-dashboard.service.js';

describe('LearnerDashboardController', () => {
  it('passes the authenticated actor to the learner dashboard service', () => {
    const actor = { id: 'learner-1', organizationId: 'org-1', roles: ['learner'] as const };
    const calls: unknown[] = [];
    const getLearnerDashboard = (value: unknown) => { calls.push(value); };
    const controller = new LearnerDashboardController({ getLearnerDashboard } as unknown as LearnerDashboardService);

    controller.getLearnerDashboard({ currentUser: actor } as unknown as AuthenticatedRequest);

    expect(calls).toEqual([actor]);
  });
});
