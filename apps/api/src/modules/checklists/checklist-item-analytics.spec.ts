import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';

import { buildItemAnalytics, ChecklistItemAnalytics, type ItemAnalyticsRow } from './checklist-item-analytics.js';
import { ChecklistSheetAnalytics } from './checklist-sheet-analytics.js';
import { checklistItemAnalyticsQuerySchema } from './checklists.schemas.js';

const SHEET = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const GROUP = 'g1';

type Rec = Record<string, unknown> & { id: string; text?: string; title?: string | null; scales: Array<{ scaleKey: string; kind: string; name: string | null; levels: Array<{ label: string | null; count: number; color: string | null }> }>; options: unknown[]; at?: string };
type Result = ItemAnalyticsRow['results'][number];
const result = (itemId: string, patch: Partial<Result> = {}): Result => ({ itemId, answerState: 'answered', scaleLevel: null, checked: true, points: 1, comment: null, reviewComment: null, ...patch });

const yesNoSnapshot = {
  checklist: {
    scoringMode: 'sum_points',
    itemGroups: [{ id: GROUP, title: 'Безопасность', order: 0 }],
    items: [{ id: 'i1', text: 'Каска', points: 1, groupId: GROUP }, { id: 'i2', text: 'Перчатки', points: 1, groupId: GROUP }, { id: 'i3', text: 'Журнал', points: 2, groupId: null }],
  },
};
function row(patch: Partial<ItemAnalyticsRow> = {}): ItemAnalyticsRow {
  return { sessionId: 's1', finishedAt: new Date('2026-11-05T09:00:00Z'), snapshot: yesNoSnapshot, feedbackAnswers: {}, employee: 'Иванов Иван', observer: 'Петров Пётр', results: [], ...patch };
}

describe('buildItemAnalytics: criteria (PR 460)', () => {
  it('counts answered, skipped, remaining, share and average per criterion', () => {
    const rows = [
      row({ results: [result('i1'), result('i2', { checked: false, points: 0 }), result('i3', { points: 2 })] }),
      row({ sessionId: 's2', results: [result('i1', { points: 1 }), result('i2', { answerState: 'skipped' })] }),
    ];
    const out = buildItemAnalytics('criteria', rows, SHEET) as { criteria: Array<Rec> };
    const byId = new Map(out.criteria.map((entry) => [entry.id, entry]));
    expect(out.criteria.map((entry) => entry.id)).toEqual(['i1', 'i2', 'i3']);
    expect(byId.get('i1')).toMatchObject({ total: 2, answered: 2, skipped: 0, remaining: 0, completionPercentage: 100, averagePercentage: 100 });
    expect(byId.get('i2')).toMatchObject({ total: 2, answered: 1, skipped: 1, remaining: 0, completionPercentage: 50, averagePercentage: 0 });
    expect(byId.get('i3')).toMatchObject({ total: 2, answered: 1, remaining: 1, completionPercentage: 50, averagePercentage: 100 });
    expect(byId.get('i1')!.scales[0]).toMatchObject({ kind: 'yes_no', levels: [{ labelKey: 'yes', count: 2 }] });
  });

  it('follows the scale of each criterion whatever its levels are called', () => {
    const scale = { id: 'sc', name: 'Освоение', levels: [{ value: 1, label: 'Не знает', score: 0, color: '#aa0000' }, { value: 2, label: 'Знает', score: 5 }] };
    const snapshot = { checklist: { scoringMode: 'sum_points', items: [{ id: 'i1', text: 'Тема', points: 5, scale }] } };
    const rows = [
      row({ snapshot, results: [result('i1', { scaleLevel: 1, points: 0 })] }),
      row({ sessionId: 's2', snapshot, results: [result('i1', { scaleLevel: 2, points: 5 })] }),
      row({ sessionId: 's3', snapshot, results: [result('i1', { scaleLevel: 2, points: 5 })] }),
    ];
    const [entry] = (buildItemAnalytics('criteria', rows, SHEET) as { criteria: Array<Rec> }).criteria;
    expect(entry.scales).toHaveLength(1);
    expect(entry.scales[0]).toMatchObject({ scaleKey: 'scale:sc', kind: 'scale', name: 'Освоение' });
    expect(entry.scales[0].levels.map((level: { label: string | null; count: number; color: string | null }) => [level.label, level.count, level.color])).toEqual([['Не знает', 1, '#aa0000'], ['Знает', 2, null]]);
    expect(entry.averagePercentage).toBe(67);
  });

  it('keeps a criterion that was removed from the sheet by its frozen text, and does not mix in later edits', () => {
    const later = { checklist: { scoringMode: 'sum_points', items: [{ id: 'i1', text: 'Каска (новая редакция)', points: 1 }] } };
    const rows = [
      row({ snapshot: later, finishedAt: new Date('2026-11-08T09:00:00Z'), results: [result('i1')] }),
      row({ sessionId: 's2', finishedAt: new Date('2026-11-01T09:00:00Z'), results: [result('i1'), result('i2')] }),
    ];
    const out = buildItemAnalytics('criteria', rows, SHEET) as { criteria: Array<Rec> };
    expect(out.criteria.find((entry) => entry.id === 'i2')).toMatchObject({ text: 'Перчатки', total: 1, answered: 1 });
    // Newest frozen text wins for a criterion that exists in both snapshots.
    expect(out.criteria.find((entry) => entry.id === 'i1')!.text).toBe('Каска (новая редакция)');
  });

  it('reports no average for a sheet without points', () => {
    const snapshot = { checklist: { scoringMode: 'none', items: [{ id: 'i1', text: 'Вопрос', points: 0 }] } };
    const [entry] = (buildItemAnalytics('criteria', [row({ snapshot, results: [result('i1', { points: 0 })] })], SHEET) as { criteria: Array<Rec> }).criteria;
    expect(entry).toMatchObject({ answered: 1, averagePercentage: null });
  });
});

describe('buildItemAnalytics: groups (PR 460)', () => {
  it('sums the criteria of a group, lists ungrouped ones apart and works for a sheet without groups', () => {
    const rows = [row({ results: [result('i1'), result('i2', { checked: false, points: 0 }), result('i3', { points: 2 })] })];
    const out = buildItemAnalytics('groups', rows, SHEET) as { groups: Array<Rec> };
    expect(out.groups.map((group) => group.id)).toEqual([GROUP, null]);
    expect(out.groups[0]).toMatchObject({ title: 'Безопасность', criteriaCount: 2, total: 2, answered: 2, averagePercentage: 50 });
    expect(out.groups[1]).toMatchObject({ title: null, criteriaCount: 1, answered: 1, averagePercentage: 100 });

    const flat = { checklist: { scoringMode: 'sum_points', items: [{ id: 'a', text: 'A', points: 1 }] } };
    const noGroups = buildItemAnalytics('groups', [row({ snapshot: flat, results: [result('a')] })], SHEET) as { groups: Array<Rec> };
    expect(noGroups.groups).toHaveLength(1);
    expect(noGroups.groups[0].id).toBeNull();
  });
});

describe('buildItemAnalytics: feedback (PR 460)', () => {
  const setId = '33333333-3333-4333-8333-333333333333';
  const feedbackSnapshot = {
    checklist: {
      ...yesNoSnapshot.checklist, feedbackEnabled: true,
      feedbackLayout: { fields: [{ id: 'note', kind: 'text', title: 'Комментарий', required: false }, { id: 'mood', kind: 'choice', title: 'Настрой', required: false, answerSetId: setId, multiple: true }], sections: [] },
      feedbackAnswerSets: { [setId]: { id: setId, name: 'Настрой', options: [{ id: 'good', name: 'Хороший', description: null }, { id: 'bad', name: 'Плохой', description: null }] } },
    },
  };
  it('counts filled fields and the spread of chosen options', () => {
    const rows = [
      row({ snapshot: feedbackSnapshot, feedbackAnswers: { note: 'Всё хорошо', mood: ['good', 'bad'] } }),
      row({ sessionId: 's2', snapshot: feedbackSnapshot, feedbackAnswers: { mood: ['good'] } }),
      row({ sessionId: null, snapshot: feedbackSnapshot }),
    ];
    const out = buildItemAnalytics('feedback', rows, SHEET) as { feedback: Array<Rec> };
    expect(out.feedback.find((field) => field.id === 'note')).toMatchObject({ kind: 'text', sessions: 2, filled: 1, notFilled: 1, options: [] });
    const mood = out.feedback.find((field) => field.id === 'mood')!;
    expect(mood).toMatchObject({ kind: 'choice', sessions: 2, filled: 2, notFilled: 0 });
    expect(mood.options).toEqual([{ id: 'good', name: 'Хороший', count: 2 }, { id: 'bad', name: 'Плохой', count: 1 }]);
  });
  it('uses the three classic fields for a sheet without a layout and skips a sheet with feedback switched off', () => {
    const classic = { checklist: { ...yesNoSnapshot.checklist } };
    const off = { checklist: { ...yesNoSnapshot.checklist, feedbackEnabled: false } };
    const out = buildItemAnalytics('feedback', [row({ snapshot: classic, feedbackAnswers: { strengths: 'Хорошо' } }), row({ sessionId: 's2', snapshot: off })], SHEET) as { feedback: Array<Rec> };
    expect(out.feedback.map((field) => field.id)).toEqual(['strengths', 'developmentAreas', 'nextSteps']);
    expect(out.feedback[0]).toMatchObject({ sessions: 1, filled: 1 });
  });
});

describe('buildItemAnalytics: notes (PR 460)', () => {
  it('counts notes per criterion and pages the list newest first by 20', () => {
    const rows = Array.from({ length: 25 }, (_, index) => row({
      sessionId: `s${index}`, finishedAt: new Date(Date.UTC(2026, 10, 1 + (index % 28), 9)),
      results: [result('i1', { comment: index % 5 === 0 ? null : `Заметка ${index}` }), result('i2', { reviewComment: index === 3 ? 'Проверено' : null })],
    }));
    const first = buildItemAnalytics('notes', rows, SHEET, 1) as { criteria: Array<Rec>; notes: { total: number; items: Array<Rec>; pageSize: number } };
    expect(first.notes.total).toBe(20 + 1);
    expect(first.notes.items).toHaveLength(20);
    expect(first.notes.items[0].at! >= first.notes.items[19].at!).toBe(true);
    expect(first.notes.items[0]).toMatchObject({ employee: 'Иванов Иван', observer: 'Петров Пётр' });
    expect(first.criteria.find((entry) => entry.id === 'i1')).toMatchObject({ answered: 25, withNote: 20, noteShare: 80 });
    const second = buildItemAnalytics('notes', rows, SHEET, 2) as typeof first;
    expect(second.notes.items).toHaveLength(1);
  });
});

describe('checklistItemAnalyticsQuerySchema (PR 460)', () => {
  const base = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' };
  it('needs a known cut and defaults the page', () => {
    expect(checklistItemAnalyticsQuerySchema.safeParse({ ...base, by: 'tables' }).success).toBe(false);
    expect(checklistItemAnalyticsQuerySchema.parse({ ...base, by: 'notes' }).page).toBe(1);
    expect(checklistItemAnalyticsQuerySchema.parse({ ...base, by: 'notes', page: '3', observerId: OTHER.toUpperCase() })).toMatchObject({ page: 3, observerId: OTHER });
  });
});

describe('ChecklistItemAnalytics (PR 460)', () => {
  function harness(actor: { id: string; roles: string[] }) {
    const sessionFind = jest.fn(async (args: unknown) => { void args; return []; });
    const instanceFind = jest.fn(async (args: unknown) => { void args; return []; });
    const prisma = {
      checklist: { findMany: jest.fn(async () => [
        { id: SHEET, title: 'Свой', createdBy: actor.id, folderId: null, status: 'published' },
        { id: OTHER, title: 'Чужой в закрытой папке', createdBy: 'other', folderId: 'closed', status: 'published' },
      ]) },
      checklistFolder: { findMany: jest.fn(async () => [{ id: 'closed', parentId: null, createdBy: 'other', visibleToStaff: false }]) },
      checklistSession: { findMany: sessionFind },
      checklistInstance: { findMany: instanceFind },
    };
    const access = new ChecklistSheetAnalytics(prisma as never);
    return { service: new ChecklistItemAnalytics(prisma as never, access), sessionFind, instanceFind };
  }
  const query = checklistItemAnalyticsQuerySchema.parse({ by: 'criteria', from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' });

  it('answers 404 for a sheet in a closed foreign folder and reads nothing for it', async () => {
    const { service, sessionFind, instanceFind } = harness({ id: 'me', roles: ['instructor'] });
    await expect(service.items('org', { id: 'me', roles: ['instructor'] }, {}, OTHER, query)).rejects.toBeInstanceOf(NotFoundException);
    expect(instanceFind).not.toHaveBeenCalled();
    // Only the observer lookup of the access rule ran.
    expect(sessionFind).toHaveBeenCalledTimes(1);
  });

  it('lets an administrator open any sheet and applies the employee scope and observer filter to the sessions read', async () => {
    const { service, sessionFind, instanceFind } = harness({ id: 'admin', roles: ['admin'] });
    const out = await service.items('org', { id: 'admin', roles: ['admin'] }, { organizationId: 'org' }, OTHER, { ...query, observerId: SHEET });
    expect(out).toMatchObject({ by: 'criteria', instances: 0, truncated: false });
    const call = JSON.stringify(sessionFind.mock.calls[0]);
    expect(call).toContain('"organizationId":"org"');
    expect(call).toContain(`"observerId":"${SHEET}"`);
    // Results finished without a session have no observer, so an observer filter leaves them out.
    expect(instanceFind).not.toHaveBeenCalled();
  });

  it('keeps a manager inside their own team by passing the viewer scope to every read', async () => {
    const { service, sessionFind, instanceFind } = harness({ id: 'me', roles: ['manager'] });
    await service.items('org', { id: 'me', roles: ['manager'] }, { id: { in: ['team-member'] } }, SHEET, query);
    expect(JSON.stringify(sessionFind.mock.calls[1])).toContain('team-member');
    expect(JSON.stringify(instanceFind.mock.calls[0])).toContain('team-member');
  });
});
