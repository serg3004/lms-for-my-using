import { buildSessionReport, type SessionReportInput } from './checklist-session-report.js';

type Row = SessionReportInput['breakdown']['rows'][number];

const person = (id: string, department: string | null = null) => ({
  id, firstName: 'Ann', lastName: id, email: `${id}@example.test`, department: department ? { id: `d-${id}`, name: department } : null,
});

function row(id: string, groupId: string | null, text: string, earned: number, max: number, state: Row['state'] = 'answered', scaleMax = 3): Row {
  const levels = [0, 1, 2, 3].filter((score) => score <= scaleMax).map((score) => ({ value: score + 1, label: `L${score}`, score, color: score === 0 ? '#C62828' : score === scaleMax ? '#2E7D32' : '#E65100' }));
  return {
    item: { id, groupId, text, order: 1, points: max, weight: 1, scale: { id: 's', name: 'S', levels } } as never,
    result: state === 'skipped' ? null : { itemId: id, checked: true, scaleLevel: earned + 1, points: earned, comment: null, photoObjectKey: null, photoFileName: null, reviewStatus: 'pending', answerState: 'answered' },
    state, earned, max,
  };
}

function input(rows: Row[], overrides: Partial<SessionReportInput> = {}): SessionReportInput {
  return {
    session: {
      id: 'sess', instanceId: 'inst', status: 'completed', scheduledAt: new Date('2026-10-01T10:00:00Z'), durationMinutes: 60,
      startedAt: new Date('2026-10-01T10:05:00Z'), timezone: 'Asia/Almaty', locationCapturePolicy: 'off',
      strengths: 'S', developmentAreas: 'D', nextSteps: 'C',
      contextFieldsSnapshot: [{ id: 'f2', label: 'Shift', type: 'text', required: false, order: 2 }, { id: 'f1', label: 'Place', type: 'text', required: false, order: 1 }],
      contextValues: { f1: 'Hall', f2: 'Night' },
    },
    instance: { id: 'inst', status: 'completed', totalScore: 71, maxScore: 79, percentage: 90, passed: true, scored: true, completedAt: new Date('2026-10-01T11:00:00Z') },
    checklistId: 'chk',
    learner: person('learner', 'Sales'),
    observer: person('observer'),
    breakdown: {
      checklist: { title: '5S', scoringMode: 'sum_points', passThreshold: 70, scaleLevels: null, feedbackEnabled: true, itemGroups: [{ id: 'g1', title: 'Sort', order: 1 }, { id: 'g2', title: 'Shine', order: 2 }] },
      rows,
      totals: { totalScore: 71, maxScore: 79, scored: true },
    },
    formula: 'snapshot',
    settings: { highPerformanceThreshold: 90, lowThreshold: 60, resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' } },
    visible: true,
    locationCaptures: [],
    ...overrides,
  };
}

// The reference sample "5S": 27 criteria, 71 of 79 points; group 1 has 1 of 1, group 2 has 70 of 78.
function sample5s() {
  const rows = [row('c1', 'g1', 'First criterion', 1, 1, 'answered', 1)];
  for (let n = 0; n < 26; n += 1) rows.push(row(`d${n}`, 'g2', `Criterion ${n}`, n < 22 ? 3 : n < 24 ? 2 : 0, 3));
  return rows;
}

describe('buildSessionReport (PR 370)', () => {
  it('matches the reference sample: 27 criteria, 71 of 79 points, groups 1 of 1 and 70 of 78, numbered 1.1 and 2.1…2.26', () => {
    const report = buildSessionReport(input(sample5s()));
    if (!report.visible) throw new Error('unreachable');

    expect(report.summary).toMatchObject({ criteriaCount: 27, totalScore: 71, maxScore: 79, percentage: 90, passed: true, answeredCount: 27 });
    expect(report.groups.map((group) => [group.number, group.title, group.score, group.maxScore, group.percentage, group.criteriaCount])).toEqual([
      ['1', 'Sort', 1, 1, 100, 1],
      ['2', 'Shine', 70, 78, 90, 26],
    ]);
    expect(report.criteria[0]).toMatchObject({ number: '1.1', score: 1, maxScore: 1 });
    expect(report.criteria[1]).toMatchObject({ number: '2.1', score: 3, maxScore: 3, levelLabel: 'L3' });
    expect(report.criteria.at(-1)).toMatchObject({ number: '2.26', score: 0, maxScore: 3 });
    // Full score is green, partial orange, zero red -- taken from the frozen level colours.
    expect(report.criteria.map((criterion) => criterion.color?.color)).toContain('#E65100');
    expect(report.criteria[1]!.color?.color).toBe('#2E7D32');
    expect(report.criteria.at(-1)!.color?.color).toBe('#C62828');
  });

  it('describes header, planned period, general information and feedback', () => {
    const report = buildSessionReport(input(sample5s()));
    expect(report.header.scheduledEnd).toEqual(new Date('2026-10-01T11:00:00Z'));
    expect(report.header.learner.department).toEqual({ id: 'd-learner', name: 'Sales' });
    expect(report.header.observer.department).toBeNull();
    expect(report.generalInfo.map((entry) => [entry.label, entry.value])).toEqual([['Place', 'Hall'], ['Shift', 'Night']]);
    expect(report.feedback).toEqual({ strengths: 'S', developmentAreas: 'D', comment: 'C' });
  });

  it('colours the total and groups by the configured result ranges', () => {
    const report = buildSessionReport(input(sample5s(), { instance: { ...input([]).instance, percentage: 75 } }));
    if (!report.visible) throw new Error('unreachable');
    expect(report.summary.color?.color).toBe('#F9A825'); // between 60 and 90
    expect(report.groups[0]!.color?.color).toBe('#2E7D32'); // 100%
    const low = buildSessionReport(input(sample5s(), { instance: { ...input([]).instance, percentage: 40 } }));
    if (!low.visible) throw new Error('unreachable');
    expect(low.summary.color?.color).toBe('#C62828');
  });

  it('leaves skipped criteria out of points and colour, and omits the feedback section when the sheet has none', () => {
    const rows = [row('c1', 'g1', 'Answered', 3, 3), row('c2', 'g1', 'Skipped', 0, 0, 'skipped')];
    const base = input(rows);
    const report = buildSessionReport({ ...base, breakdown: { ...base.breakdown, checklist: { ...base.breakdown.checklist, feedbackEnabled: false } } });
    if (!report.visible) throw new Error('unreachable');
    expect(report.criteria[1]).toMatchObject({ state: 'skipped', score: null, maxScore: null, color: null });
    expect(report.groups[0]).toMatchObject({ score: 3, maxScore: 3, criteriaCount: 2 });
    expect(report.summary).toMatchObject({ answeredCount: 1, skippedCount: 1 });
    expect(report.feedback).toBeNull();
  });

  it('numbers criteria without a group on their own and puts them after the groups', () => {
    const report = buildSessionReport(input([row('c1', 'g2', 'In group', 1, 1), row('u1', null, 'Loose one', 1, 1), row('u2', null, 'Loose two', 1, 1)]));
    expect(report.criteria.map((criterion) => criterion.number)).toEqual(['1.1', '1', '2']);
    expect(report.groups).toHaveLength(1);
  });

  it('carries no result data when the learner may not see it yet', () => {
    const report = buildSessionReport(input(sample5s(), { visible: false }));
    expect(report).toMatchObject({ visible: false, summary: null, groups: [], criteria: [], feedback: null, generalInfo: [] });
    expect(report.header.learner.id).toBe('learner');
  });

  it('is not scored when nothing could be scored and reads old snapshots without colours', () => {
    const rows = [row('c1', 'g1', 'Skipped', 0, 0, 'skipped')];
    const base = input(rows);
    const noColor = { ...rows[0]!, state: 'answered' as const, earned: 2, max: 3, item: { ...rows[0]!.item, scale: { id: 's', name: 'S', levels: [{ value: 3, label: 'Mid', score: 2 }, { value: 4, label: 'Top', score: 3 }] } } as never, result: { ...rows[0]!.result, itemId: 'c1', scaleLevel: 3, checked: true, points: 2, comment: null, photoObjectKey: null, photoFileName: null, reviewStatus: 'pending', answerState: 'answered' } as never };
    const empty = buildSessionReport({ ...base, instance: { ...base.instance, scored: false, percentage: 0 } });
    if (!empty.visible) throw new Error('unreachable');
    expect(empty.summary).toMatchObject({ scored: false, percentage: null, color: null });
    const old = buildSessionReport({ ...base, breakdown: { ...base.breakdown, rows: [noColor] } });
    expect(old.criteria[0]!.color?.color).toBe('#E65100');
  });
});
