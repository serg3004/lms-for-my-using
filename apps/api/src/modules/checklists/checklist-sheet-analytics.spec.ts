import { jest } from '@jest/globals';

import { accessibleAnalyticsSheetIds, buildSheetAnalytics, ChecklistSheetAnalytics, type AnalyticsInstance } from './checklist-sheet-analytics.js';
import { checklistSheetAnalyticsQuerySchema } from './checklists.schemas.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-11-10T12:00:00Z');

describe('accessibleAnalyticsSheetIds (PR 459)', () => {
  const sheets = [
    { id: 'own', createdBy: 'me', folderId: 'closed' },
    { id: 'observed', createdBy: 'other', folderId: 'closed' },
    { id: 'open', createdBy: 'other', folderId: 'open' },
    { id: 'rootless', createdBy: 'other', folderId: null },
    { id: 'hidden', createdBy: 'other', folderId: 'closed' },
  ];
  const folders = [
    { id: 'open', parentId: null, createdBy: 'other', visibleToStaff: true },
    { id: 'closed', parentId: null, createdBy: 'other', visibleToStaff: false },
  ];
  it('gives an administrator every sheet', () => {
    expect([...accessibleAnalyticsSheetIds(sheets, folders, { id: 'admin', roles: ['admin'] }, new Set())].sort()).toEqual(['hidden', 'observed', 'open', 'own', 'rootless']);
  });
  it('gives others their own, observed, shared-folder and folderless sheets, but not the ones in a closed foreign folder', () => {
    const ids = accessibleAnalyticsSheetIds(sheets, folders, { id: 'me', roles: ['instructor'] }, new Set(['observed']));
    expect([...ids].sort()).toEqual(['observed', 'open', 'own', 'rootless']);
    expect(ids.has('hidden')).toBe(false);
  });
});

function instance(patch: Partial<AnalyticsInstance> & Pick<AnalyticsInstance, 'checklistId'>): AnalyticsInstance {
  return { sessionStatus: 'completed', scheduledAt: new Date('2026-11-05T09:00:00Z'), instanceStatus: 'completed', percentage: 80, scored: true,
    snapshot: { checklist: { scoringMode: 'sum_points', items: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }] } }, results: [], ...patch };
}

describe('buildSheetAnalytics (PR 459)', () => {
  const sheets = [{ id: A, title: 'Лист A' }, { id: B, title: 'Лист B' }];

  it('counts plan, fact, in progress, overdue and remaining per sheet and in total, without cancelled sessions', () => {
    const result = buildSheetAnalytics(sheets, [
      instance({ checklistId: A }),
      instance({ checklistId: A, sessionStatus: 'scheduled', instanceStatus: 'assigned', scheduledAt: new Date('2026-11-01T09:00:00Z') }),
      instance({ checklistId: A, sessionStatus: 'in_progress', instanceStatus: 'in_progress', scheduledAt: new Date('2026-11-12T09:00:00Z') }),
      instance({ checklistId: A, sessionStatus: 'cancelled', instanceStatus: 'assigned' }),
      instance({ checklistId: B }),
    ], [], now);
    const a = result.sheets.find((sheet) => sheet.checklistId === A)!;
    expect(a.plan).toEqual({ planned: 3, completed: 1, inProgress: 1, notStarted: 1, overdue: 1, remaining: 2 });
    expect(a.completionPercentage).toBe(33);
    expect(result.total.plan.planned).toBe(4);
    expect(result.total.plan.completed).toBe(2);
    expect(result.total.completionPercentage).toBe(50);
  });

  it('averages only finished scored sessions and counts a free result next to them', () => {
    const result = buildSheetAnalytics(sheets, [
      instance({ checklistId: A, percentage: 60 }),
      instance({ checklistId: A, percentage: 100 }),
      instance({ checklistId: A, percentage: 0, scored: false }),
      instance({ checklistId: A, sessionStatus: null, percentage: 90 }),
      instance({ checklistId: A, sessionStatus: 'in_progress', instanceStatus: 'in_progress', percentage: 10 }),
    ], [], now);
    expect(result.total.averagePercentage).toBe(83);
    expect(result.total.selfCompleted).toBe(1);
    expect(result.total.plan.planned).toBe(4);
  });

  it('reports the queue of every session not started, with the age of the oldest', () => {
    const result = buildSheetAnalytics(sheets, [], [
      { checklistId: A, scheduledAt: new Date('2026-10-31T12:00:00Z'), createdAt: new Date('2026-10-01T00:00:00Z') },
      { checklistId: A, scheduledAt: null, createdAt: new Date('2026-11-09T12:00:00Z') },
    ], now);
    expect(result.sheets[0]!.queue).toEqual({ notStarted: 2, oldestDays: 10 });
    expect(result.sheets[1]!.queue).toEqual({ notStarted: 0, oldestDays: null });
    expect(result.total.queue.notStarted).toBe(2);
  });

  it('counts answered, skipped and remaining criteria from the frozen snapshot', () => {
    const result = buildSheetAnalytics(sheets, [instance({ checklistId: A, results: [
      { itemId: 'i1', answerState: 'answered', scaleLevel: null, checked: true, points: 2 },
      { itemId: 'i2', answerState: 'skipped', scaleLevel: null, checked: false, points: 0 },
      { itemId: 'gone', answerState: 'answered', scaleLevel: null, checked: true, points: 2 },
    ] })], [], now);
    expect(result.total.criteria).toEqual({ total: 3, answered: 1, skipped: 1, remaining: 1, zeroPoints: 0 });
  });

  it('follows the scale of each criterion instead of a fixed "No": yes/no, a custom scale and a sheet-level scale', () => {
    const custom = { id: 's1', name: 'Качество', levels: [{ value: 0, label: 'Не знаю', score: 0, color: '#aaaaaa' }, { value: 1, label: 'Знаю', score: 2 }] };
    const result = buildSheetAnalytics(sheets, [
      instance({ checklistId: A, snapshot: { checklist: { scoringMode: 'sum_points', items: [{ id: 'i1' }, { id: 'i2', scale: custom }] } },
        results: [
          { itemId: 'i1', answerState: 'answered', scaleLevel: null, checked: false, points: 0 },
          { itemId: 'i2', answerState: 'answered', scaleLevel: 0, checked: false, points: 0 },
        ] }),
      instance({ checklistId: B, snapshot: { checklist: { scoringMode: 'scale', scaleLevels: [{ level: 1, label: 'Плохо', points: 0 }, { level: 2, label: 'Отлично', points: 4, color: '#00aa00' }], items: [{ id: 'j1' }] } },
        results: [{ itemId: 'j1', answerState: 'answered', scaleLevel: 2, checked: false, points: 4 }] }),
    ], [], now);
    const scales = result.total.scales;
    expect(scales.map((scale) => scale.scaleKey).sort()).toEqual(['scale:s1', `sheet:${B}`, 'yes_no']);
    expect(scales.find((scale) => scale.scaleKey === 'yes_no')!.levels).toEqual([{ value: 0, label: null, labelKey: 'no', color: null, count: 1 }]);
    expect(scales.find((scale) => scale.scaleKey === 'scale:s1')!.levels[0]).toEqual({ value: 0, label: 'Не знаю', labelKey: null, color: '#aaaaaa', count: 1 });
    expect(scales.find((scale) => scale.scaleKey === `sheet:${B}`)!.levels).toEqual([{ value: 2, label: 'Отлично', labelKey: null, color: '#00aa00', count: 1 }]);
    expect(result.total.criteria.zeroPoints).toBe(2);
  });

  it('does not count zero points when the sheet has no points at all', () => {
    const result = buildSheetAnalytics(sheets, [instance({ checklistId: A, snapshot: { checklist: { scoringMode: 'none', items: [{ id: 'i1' }] } },
      results: [{ itemId: 'i1', answerState: 'answered', scaleLevel: null, checked: false, points: 0 }] })], [], now);
    expect(result.total.criteria.zeroPoints).toBe(0);
  });
});

describe('checklistSheetAnalyticsQuerySchema (PR 459)', () => {
  const base = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' };
  it('reads comma-separated sheet ids and allows none', () => {
    expect(checklistSheetAnalyticsQuerySchema.parse({ ...base, checklistIds: `${A.toUpperCase()}, ${B}` }).checklistIds).toEqual([A, B]);
    expect(checklistSheetAnalyticsQuerySchema.parse(base).checklistIds).toBeUndefined();
  });
  it('rejects a malformed id and a missing period', () => {
    expect(() => checklistSheetAnalyticsQuerySchema.parse({ ...base, checklistIds: 'nope' })).toThrow();
    expect(() => checklistSheetAnalyticsQuerySchema.parse({ checklistIds: A })).toThrow();
  });
});

describe('ChecklistSheetAnalytics (PR 459)', () => {
  function harness(actor: { id: string; roles: string[] }) {
    const checklistFind = jest.fn(async () => [
      { id: A, title: 'Свой', createdBy: actor.id, folderId: null, status: 'published' },
      { id: B, title: 'Чужой в закрытой папке', createdBy: 'other', folderId: 'closed', status: 'published' },
    ]);
    const sessionFind = jest.fn(async () => []);
    const prisma = {
      checklist: { findMany: checklistFind },
      checklistFolder: { findMany: jest.fn(async () => [{ id: 'closed', parentId: null, createdBy: 'other', visibleToStaff: false }]) },
      checklistSession: { findMany: sessionFind },
      checklistInstance: { findMany: jest.fn(async () => []) },
    };
    return { service: new ChecklistSheetAnalytics(prisma as never), sessionFind };
  }
  const query = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' };

  it('drops a requested sheet the viewer may not see and applies the employee scope to every read', async () => {
    const { service, sessionFind } = harness({ id: 'me', roles: ['instructor'] });
    const scope = { organizationId: 'org' };
    const result = await service.overview('org', { id: 'me', roles: ['instructor'] }, scope, { ...query, checklistIds: [A, B] });
    expect(result.sheets.map((sheet) => sheet.checklistId)).toEqual([A]);
    const sessionCalls = sessionFind.mock.calls.map((call) => JSON.stringify(call));
    expect(sessionCalls.some((call) => call.includes(B))).toBe(false);
    expect(sessionCalls.filter((call) => call.includes('"organizationId":"org"')).length).toBeGreaterThan(0);
  });

  it('answers an empty result without reading sessions when no sheet is accessible', async () => {
    const { service, sessionFind } = harness({ id: 'nobody', roles: ['instructor'] });
    const result = await service.overview('org', { id: 'nobody', roles: ['instructor'] }, {}, { ...query, checklistIds: [B] });
    expect(result.sheets).toEqual([]);
    expect(result.total.plan.planned).toBe(0);
    // Only the observer lookup ran; no sessions for sheets were read.
    expect(sessionFind).toHaveBeenCalledTimes(1);
  });

  it('lists the sheets with the number of sessions planned in the period', async () => {
    const { service } = harness({ id: 'me', roles: ['admin'] });
    const list = await service.listSheets('org', { id: 'me', roles: ['admin'] }, {}, query);
    expect(list.map((sheet) => sheet.id).sort()).toEqual([A, B]);
    expect(list.every((sheet) => sheet.sessionsInPeriod === 0)).toBe(true);
  });
});
