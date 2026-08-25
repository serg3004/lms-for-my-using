import { describe, expect, it } from 'vitest';

import type { ManagerTeamSummary } from '../../shared/api/manager.js';
import { buildManagerReport, filterReportMembers } from './model.js';

const summary: ManagerTeamSummary = {
  membersCount: 2, completionRate: 50, dueThisWeekCount: 0, overdueCount: 2, avgTeamScore: null,
  upcomingDeadlines: [],
  overdueAssignments: [
    { assignmentId: 'a1', courseTitle: 'Safety', userId: 'u1', groupId: null, groupName: null, dueAt: '2026-08-01' },
    { assignmentId: 'a2', courseTitle: 'Policy', userId: 'u2', groupId: null, groupName: null, dueAt: '2026-08-02' },
  ],
  members: [
    { userId: 'u1', firstName: 'Ada', lastName: null, email: 'ada@example.com', activeCoursesCount: 2, completionPercent: 75, status: 'good' },
    { userId: 'u2', firstName: 'Lin', lastName: null, email: 'lin@example.com', activeCoursesCount: 1, completionPercent: 25, status: 'risk' },
  ],
};

describe('manager reports model', () => {
  it('filters only within the scoped team result', () => {
    expect(filterReportMembers(summary.members, 'all', 'risk').map((member) => member.userId)).toEqual(['u2']);
    expect(filterReportMembers(summary.members, 'u1', 'all').map((member) => member.userId)).toEqual(['u1']);
  });

  it('recalculates KPI and drill-down data for selected members', () => {
    expect(buildManagerReport(summary, [summary.members[0]!])).toMatchObject({ enrollments: 2, completionRate: 75, overdueCount: 1 });
    expect(buildManagerReport(summary, [])).toMatchObject({ enrollments: 0, completionRate: 0, overdueCount: 0 });
  });
});
