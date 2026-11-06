import { jest } from '@jest/globals';
import { presentLearnerInstance, presentLearnerReport, withoutLearnerPoints } from './checklist-learner-result.js';
import { ChecklistsController } from './checklists.controller.js';
import type { AuthenticatedRequest } from '../auth/public.js';

const instance = (showPointsToLearner = false, status = 'completed') => ({
  id: 'instance', userId: 'learner', status, totalScore: 71, maxScore: 79, percentage: 90, passed: true, scored: true,
  checklist: { showPointsToLearner, scoringMode: 'scale', scaleLevels: [{ level: 1, label: 'Good', points: 79 }], items: [{ id: 'criterion', text: 'Check', points: 79, weight: 1, scale: { levels: [{ value: 1, label: 'Good', score: 79 }] } }] },
  results: [{ itemId: 'criterion', scaleLevel: 1, points: 71 }],
  contextValues: { score: 'owner text' }, feedbackAnswers: { points: 'user answer' },
});

it('removes all numeric point fields from learner wire data, keeping percentages, answers, source data and free-form content', () => {
  const source = instance(); const result = presentLearnerInstance(source);
  for (const value of [result, result.checklist.items[0], result.checklist.scaleLevels[0], result.checklist.items[0]!.scale.levels[0], result.results[0]]) {
    expect(value).not.toHaveProperty('points'); expect(value).not.toHaveProperty('score');
  }
  expect(result).not.toHaveProperty('totalScore'); expect(result).not.toHaveProperty('maxScore');
  expect(result.percentage).toBe(90); expect(result.passed).toBe(true);
  expect(result.results[0]?.scaleLevel).toBe(1); expect(result.contextValues.score).toBe('owner text');
  expect(result.feedbackAnswers.points).toBe('user answer'); expect(source.totalScore).toBe(71);
});

it.each(['assigned', 'in_progress', 'submitted', 'expired'])('withholds the result in %s even when points are enabled', (status) => {
  const result = presentLearnerInstance(instance(true, status));
  expect(result.percentage).toBeNull(); expect(result.passed).toBeNull(); expect(result.scored).toBeNull();
  expect(result).not.toHaveProperty('totalScore'); expect(result.results[0]).not.toHaveProperty('points');
});

it('reveals points only after completion when explicitly enabled, including zero values', () => {
  const source = instance(true); source.totalScore = 0;
  expect(presentLearnerInstance(source).totalScore).toBe(0);
  expect(presentLearnerInstance(source).results[0]?.points).toBe(71);
});

it('removes report point fields but retains percentages and verdicts; staff reports stay intact', () => {
  const report = { pointsVisible: false, summary: { totalScore: 71, maxScore: 79, percentage: 90, passed: true }, groups: [{ score: 71, maxScore: 79, percentage: 90 }], criteria: [{ score: 3, maxScore: 4 }] };
  const safe = presentLearnerReport(report);
  expect(JSON.stringify(safe)).not.toMatch(/"(?:totalScore|maxScore|score)":/);
  expect(safe.summary).toMatchObject({ percentage: 90, passed: true });
  expect(presentLearnerReport({ ...report, pointsVisible: true }).summary.totalScore).toBe(71);
});

function controller(observer = false) {
  const source = instance();
  const service = { getInstance: jest.fn(async () => source), listMyInstances: jest.fn(async () => [source]), finishInstance: jest.fn(async () => source), submitItemResult: jest.fn(async () => source), skipItem: jest.fn(async () => source) };
  const access = { isAssignedObserver: jest.fn(async () => observer), assertReviewerCanAccess: jest.fn(async () => undefined) };
  return { source, target: new ChecklistsController(service as never, {} as never, access as never, {} as never, {} as never, {} as never, {} as never) };
}
const request = (roles: string[], id = 'learner') => ({ currentUser: { id, roles, organizationId: 'org' } }) as AuthenticatedRequest;

it('enforces learner masking on detail, list and mutation responses', async () => {
  const { target } = controller(); const req = request(['learner']);
  const responses = [await target.getInstance('instance', req), ...(await target.listMyInstances(req)), await target.finishInstance('instance', req), await target.submitItemResult('instance', 'criterion', { checked: true }, req), await target.skipItem('instance', 'criterion', {}, req)];
  for (const value of responses) expect(JSON.stringify(value)).not.toMatch(/"(?:totalScore|maxScore|points)":\d/);
});

it.each(['admin', 'manager', 'instructor', 'mentor'])('preserves staff points for %s', async (role) => {
  const { target, source } = controller(); expect(await target.getInstance('instance', request([role], 'staff'))).toBe(source);
});

it('preserves an assigned observer’s points even if their only global role is learner', async () => {
  const { target, source } = controller(true); expect(await target.getInstance('instance', request(['learner'], 'observer'))).toBe(source);
});

it('does not leak an unfinished result through history metadata, preserving event identity and text', () => {
  const events = [{ id: 'event', metadata: { previousPercentage: 20, newPercentage: 90, newPassed: true, totalScore: 71, reason: 'Review' } }];
  expect(withoutLearnerPoints(events, true)).toEqual([{ id: 'event', metadata: { reason: 'Review' } }]);
});

it('applies the learner projection to report and history endpoints, not just ordinary instances', async () => {
  const events = [{ id: 'event', metadata: { newPercentage: 90, totalScore: 71 } }];
  const revisions = [{ id: 'revision', newPercentage: 90, newPassed: true }];
  const sessions = {
    get: jest.fn(async () => ({ observerId: 'observer', checklist: { showPointsToLearner: false }, result: { visible: false } })),
    listEvents: jest.fn(async () => events), listScoreRevisions: jest.fn(async () => revisions),
    getReport: jest.fn(async () => ({ pointsVisible: false, summary: { percentage: 90, totalScore: 71, maxScore: 79 } })),
  };
  const target = new ChecklistsController({ feedbackVisibilityOverrides: async () => new Map() } as never, {} as never,
    { sessionScope: async () => ({}) } as never, { getSettings: async () => ({ feedbackVisibility: 'live' }) } as never,
    sessions as never, {} as never, {} as never);
  const req = request(['learner']);
  expect(await target.listSessionEvents('session', req)).toEqual([{ id: 'event', metadata: {} }]);
  expect(await target.listScoreRevisions('session', req)).toEqual([{ id: 'revision' }]);
  expect(await target.getSessionReport('session', req)).toMatchObject({ summary: { percentage: 90 } });
  expect((await target.getSessionReport('session', req)).summary).not.toHaveProperty('totalScore');
});
