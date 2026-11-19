import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { ChecklistInstanceReport, toReportTransfers, type InstanceReportViewer } from './checklist-instance-report.js';

const org = '11111111-1111-1111-1111-111111111111';
const instanceId = '22222222-2222-2222-2222-222222222222';
const frozen = { highPerformanceThreshold: 90, lowThreshold: 60, resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' } };
const viewer = (patch: Partial<InstanceReportViewer> = {}): InstanceReportViewer => ({ id: 'u1', organizationId: org, locale: 'ru', privileged: false, ...patch });

function setup(options: { status?: string; session?: { id: string } | null; guestName?: string | null; missing?: boolean; showPoints?: boolean; scoringMode?: string } = {}) {
  const row = {
    id: instanceId, userId: 'u1', status: options.status ?? 'in_progress', guestName: options.guestName ?? null, checklistId: 'chk', totalScore: 8, maxScore: 10, percentage: 80,
    passed: true, scored: true, completedAt: new Date('2026-11-19T10:00:00Z'), createdAt: new Date('2026-11-19T08:00:00Z'), reportSettings: frozen, session: options.session ?? null,
    user: { id: 'u1', firstName: 'Anna', lastName: 'Ivanova', email: 'a@example.test', timezone: 'Asia/Almaty', departmentMemberships: [{ department: { id: 'd1', name: 'Sales' } }] },
  };
  const prisma = {
    checklistInstance: { findFirst: jest.fn(async () => (options.missing ? null : row)) },
    checklistScoreRevision: { findFirst: jest.fn(async () => null) },
  };
  const breakdown = jest.fn(async () => ({
    checklist: { title: '5S', scoringMode: options.scoringMode ?? 'sum_points', passThreshold: 70, scaleLevels: null, feedbackEnabled: true, showPointsToLearner: options.showPoints ?? false, itemGroups: [] },
    rows: [{
      item: { id: 'c1', groupId: null, text: 'Floor is clean', order: 1, points: 10, weight: 1 },
      result: { itemId: 'c1', checked: true, scaleLevel: null, points: 8, comment: 'Mopped', photoObjectKey: 'k', photoFileName: 'f.jpg', reviewStatus: 'pending', answerState: 'answered' },
      state: 'answered', earned: 8, max: 10,
    }],
    totals: { totalScore: 8, maxScore: 10, scored: true },
  }));
  const history = jest.fn(async () => [{ id: 'e1', at: new Date('2026-11-19T09:00:00Z'), note: 'Gate 3', from: { id: 'u0', firstName: 'Boris', lastName: 'Petrov' }, to: { id: 'u1', firstName: 'Anna', lastName: 'Ivanova' } }]);
  const service = new ChecklistInstanceReport({ prisma: prisma as never, auditLog: { record: jest.fn(async () => undefined) } as never, breakdown: breakdown as never, history, readPhotoBytes: async () => null });
  return { service, prisma, breakdown, history };
}

describe('ChecklistInstanceReport.get (PR 478)', () => {
  it('shows answers, comments and photos but no points, result or colour before the check is completed', async () => {
    const report = await setup().service.get(instanceId, viewer({ privileged: true }));
    expect(report.visible).toBe(true);
    if (!report.visible) throw new Error('unreachable');
    expect(report.summary).toBeNull();
    expect(report.groups).toEqual([]);
    expect(report.criteria[0]).toMatchObject({ text: 'Floor is clean', comment: 'Mopped', photo: { fileName: 'f.jpg' }, score: null, maxScore: null, color: null });
    expect(report.header).toMatchObject({ status: 'in_progress', observer: null, scheduledStart: null });
    expect(report.sessionId).toBeNull();
  });

  it('is the session report after completion, with points for staff', async () => {
    const report = await setup({ status: 'completed' }).service.get(instanceId, viewer({ privileged: true }));
    if (!report.visible) throw new Error('unreachable');
    expect(report.summary).toMatchObject({ scored: true, percentage: 80, totalScore: 8, maxScore: 10, passed: true });
    expect(report.criteria[0]).toMatchObject({ score: 8, maxScore: 10 });
  });

  it('hides points from the executor unless the sheet shows them, but keeps the result', async () => {
    const hidden = await setup({ status: 'completed' }).service.get(instanceId, viewer());
    if (!hidden.visible) throw new Error('unreachable');
    expect(JSON.stringify(hidden)).not.toContain('"totalScore"');
    expect(hidden.criteria[0]).not.toHaveProperty('score');
    expect(hidden.summary).toMatchObject({ percentage: 80, passed: true });
    const shown = await setup({ status: 'completed', showPoints: true }).service.get(instanceId, viewer());
    if (!shown.visible) throw new Error('unreachable');
    expect(shown.criteria[0]).toMatchObject({ score: 8 });
  });

  it('carries the hand-over history with names, oldest first', async () => {
    const report = await setup().service.get(instanceId, viewer());
    expect(report.transfers).toEqual([{ id: 'e1', at: new Date('2026-11-19T09:00:00Z'), note: 'Gate 3', from: 'Boris Petrov', to: 'Anna Ivanova' }]);
  });

  it('answers 404 for a missing check, 400 for a session and for a guest pass', async () => {
    await expect(setup({ missing: true }).service.get(instanceId, viewer())).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ session: { id: 's' } }).service.get(instanceId, viewer())).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ guestName: 'Guest' }).service.get(instanceId, viewer())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reads the check inside the viewer organization only', async () => {
    const { service, prisma } = setup();
    await service.get(instanceId, viewer());
    expect(prisma.checklistInstance.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: instanceId, organizationId: org, deletedAt: null } }));
  });
});

describe('toReportTransfers (PR 478)', () => {
  it('names a removed person as empty', () => {
    expect(toReportTransfers([{ id: 'e', at: new Date(0), note: null, from: null, to: { id: 'u', firstName: 'A', lastName: 'B' } }])).toEqual([{ id: 'e', at: new Date(0), note: null, from: null, to: 'A B' }]);
  });
});
