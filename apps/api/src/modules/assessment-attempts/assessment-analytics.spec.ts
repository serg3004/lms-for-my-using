/// <reference types="jest" />

import { assessmentAnalyticsQuery, summarizeAssessment } from './assessment-analytics.js';

type Attempts = Parameters<typeof summarizeAssessment>[0];

function attempts(count: number): Attempts {
  return Array.from({ length: count }, (_, index) => ({
    id: `a${index}`, userId: `u${index}`, score: index, maxScore: 10, percentage: 90 - index * 10, passed: index < 3,
    startedAt: new Date('2026-11-01T10:00:00Z'), completedAt: new Date('2026-11-01T10:05:00Z'), createdAt: new Date('2026-11-01T10:00:00Z'),
    courseId: null, placementId: null, longreadRevisionId: null,
    user: { firstName: `N${index}`, lastName: 'L', departmentMemberships: [], groupMemberships: [] },
  })) as unknown as Attempts;
}
const query = assessmentAnalyticsQuery.parse({});

describe('assessment analytics ranking (PR 584)', () => {
  it('lists nobody as both a leader and lagging in a small group', async () => {
    const result = await summarizeAssessment(attempts(4), [], query, async () => []);
    expect(result.leaders).toHaveLength(4);
    expect(result.lagging).toEqual([]);
  });

  it('splits seven employees into five leaders and the two last ones, worst first', async () => {
    const result = await summarizeAssessment(attempts(7), [], query, async () => []);
    expect(result.leaders.map(({ id }) => id)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4']);
    expect(result.lagging.map(({ id }) => id)).toEqual(['u6', 'u5']);
  });

  it('keeps the usual five and five for a large group', async () => {
    const result = await summarizeAssessment(attempts(12), [], query, async () => []);
    expect(result.leaders).toHaveLength(5);
    expect(result.lagging.map(({ id }) => id)).toEqual(['u11', 'u10', 'u9', 'u8', 'u7']);
  });
});
