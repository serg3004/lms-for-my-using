/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 397, verified against real Postgres: a checklist may override five groups of the organization's
// module settings; every reader uses the sheet's value, and a finished report never repaints.
describe('checklist module-settings overrides (PR 397) — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let sessionService: ChecklistSessionService;
  let organizationId: string;
  let learnerId: string;
  let observerId: string;
  let otherObserverId: string;
  let adminId: string;
  const live = { isLearnerOnly: false, feedbackVisibility: 'live' as const };

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
    checklistsService = new ChecklistsService(prisma, {} as UploadService);
    sessionService = new ChecklistSessionService(prisma, checklistsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Overrides ${runId}`, slug: `ovr-${runId}` } })).id;
    const user = async (tag: string, role?: 'instructor' | 'admin') => {
      const created = await prisma.user.create({ data: { organizationId, email: `${tag}-${runId}@example.test`, passwordHash: 'x', firstName: tag, lastName: 'User' } });
      if (role) await prisma.membership.create({ data: { organizationId, userId: created.id, role } });
      return created.id;
    };
    learnerId = await user('learner');
    observerId = await user('observer', 'instructor');
    otherObserverId = await user('other', 'instructor');
    adminId = await user('admin', 'admin');
  });

  afterEach(async () => {
    await prisma.checklistScoreRevision.deleteMany({ where: { organizationId } });
    await prisma.checklistSessionEvent.deleteMany({ where: { organizationId } });
    await prisma.checklistSession.deleteMany({ where: { organizationId } });
    await prisma.checklistItemResult.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.checklistWorkplaceSettings.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  async function sheet(extra: Record<string, unknown> = {}) {
    const created = await prisma.checklist.create({ data: { organizationId, title: 'Sheet', status: 'published', passThreshold: 50, ...extra } });
    const item = await prisma.checklistItem.create({ data: { organizationId, checklistId: created.id, order: 1, text: 'Item', points: 10, isRequired: true } });
    return { ...created, itemId: item.id };
  }

  async function completedSession(checklist: { id: string; itemId: string }) {
    const instance = await checklistsService.assignChecklist(checklist.id, organizationId, { userId: learnerId }, observerId);
    const created = await sessionService.create(organizationId, { instanceId: instance.id, observerId, timezone: 'UTC' } as never, observerId);
    const started = await sessionService.transition(created.id, organizationId, 'start', created.version, observerId, {});
    await checklistsService.submitItemResult(instance.id, checklist.itemId, organizationId, observerId, true, { checked: true });
    await sessionService.transition(started.id, organizationId, 'complete', started.version, observerId, {});
    return { sessionId: started.id, instanceId: instance.id };
  }

  const reportOf = (sessionId: string) => sessionService.getReport(sessionId, organizationId, {}, live, { id: observerId, isAdmin: false });
  const summaryColor = (report: Awaited<ReturnType<typeof reportOf>>) => {
    if (!report.visible) throw new Error('hidden');
    return report.summary.color?.color;
  };

  it('stores, shows, resets and rejects overlapping thresholds for a sheet', async () => {
    const { id } = await sheet();
    const updated = await checklistsService.updateChecklist(id, organizationId, {
      moduleSettings: { thresholds: { high: 70, low: 30 }, resultColors: { low: '#111111', mid: '#222222', high: '#333333' }, feedbackVisibility: 'live' },
    }, adminId);
    expect(updated.moduleSettings).toMatchObject({
      thresholds: { high: 70, low: 30 }, resultColors: { low: '#111111', mid: '#222222', high: '#333333' }, feedbackVisibility: 'live', observers: null,
    });
    expect(updated.hasModuleOverrides).toBe(true);
    expect(updated).not.toHaveProperty('highThresholdOverride');

    await expect(checklistsService.updateChecklist(id, organizationId, { moduleSettings: { thresholds: { high: 40, low: 40 } } }, adminId))
      .rejects.toBeInstanceOf(UnprocessableEntityException);

    const reset = await checklistsService.updateChecklist(id, organizationId, { moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null } }, adminId);
    expect(reset.moduleSettings).toEqual({ thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null });
    expect(reset.hasModuleOverrides).toBe(false);
    expect((await checklistsService.listChecklists(organizationId)).find((row) => row.id === id)?.hasModuleOverrides).toBe(false);
  });

  it('a sheet without overrides follows the organization, one with overrides paints from its own colours', async () => {
    await prisma.checklistWorkplaceSettings.create({ data: { organizationId, moduleEnabled: true, highPerformanceThreshold: 80, lowThreshold: 40, resultColorHigh: '#00AA00' } });
    const plain = await sheet();
    const own = await sheet({ highThresholdOverride: 50, lowThresholdOverride: 10, resultColorLowOverride: '#010101', resultColorMidOverride: '#020202', resultColorHighOverride: '#0000FF' });
    const plainReport = await reportOf((await completedSession(plain)).sessionId);
    const ownReport = await reportOf((await completedSession(own)).sessionId);

    expect(plainReport.visible && plainReport.summary.percentage).toBe(100);
    expect(summaryColor(plainReport)).toBe('#00AA00');
    expect(summaryColor(ownReport)).toBe('#0000FF');
  });

  it('a finished report keeps the colours it was completed with', async () => {
    const own = await sheet({ highThresholdOverride: 50, lowThresholdOverride: 10, resultColorLowOverride: '#010101', resultColorMidOverride: '#020202', resultColorHighOverride: '#0000FF' });
    const { sessionId, instanceId } = await completedSession(own);
    expect(summaryColor(await reportOf(sessionId))).toBe('#0000FF');
    expect((await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instanceId } })).reportSettings).toMatchObject({ highPerformanceThreshold: 50 });

    await checklistsService.updateChecklist(own.id, organizationId, { moduleSettings: { resultColors: { low: '#AA0000', mid: '#BB0000', high: '#CC0000' } } }, adminId);
    await prisma.checklistWorkplaceSettings.upsert({ where: { organizationId }, create: { organizationId, resultColorHigh: '#DD0000' }, update: { resultColorHigh: '#DD0000' } });
    expect(summaryColor(await reportOf(sessionId))).toBe('#0000FF');
  });

  it('a sheet restricts who may observe it; others keep the organization list', async () => {
    const restricted = await sheet({ observerEligibilityOverride: 'selected_users', observerUserIdsOverride: [otherObserverId] });
    const open = await sheet();
    let n = 0;
    const assign = async (checklistId: string) => {
      const learner = await prisma.user.create({ data: { organizationId, email: `l${++n}-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'L', lastName: `${n}` } });
      return (await checklistsService.assignChecklist(checklistId, organizationId, { userId: learner.id }, adminId)).id;
    };

    await expect(sessionService.create(organizationId, { instanceId: await assign(restricted.id), observerId, timezone: 'UTC' } as never, adminId))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(sessionService.create(organizationId, { instanceId: await assign(restricted.id), observerId: otherObserverId, timezone: 'UTC' } as never, adminId))
      .resolves.toMatchObject({ observerId: otherObserverId });
    await expect(sessionService.create(organizationId, { instanceId: await assign(open.id), observerId, timezone: 'UTC' } as never, adminId))
      .resolves.toMatchObject({ observerId });

    const listed = await sessionService.listParticipants(organizationId, { role: 'observer', checklistId: restricted.id, page: 1, pageSize: 25 }, {});
    expect(listed.items.map((user: { id: string }) => user.id)).toEqual([otherObserverId]);
  });

  it('only an administrator-level change of the observer list counts as a change', async () => {
    const { id } = await sheet({ observerEligibilityOverride: 'any_user' });
    const same = { eligibility: 'any_user' as const, roles: [], userIds: [] };
    expect(await checklistsService.changesSheetObservers(id, organizationId, same)).toBe(false);
    expect(await checklistsService.changesSheetObservers(id, organizationId, { ...same, eligibility: 'selected_roles' })).toBe(true);
    expect(await checklistsService.changesSheetObservers(id, organizationId, null)).toBe(true);
    expect(await checklistsService.changesSheetObservers(id, organizationId, undefined)).toBe(false);
    await expect(checklistsService.updateChecklist(id, organizationId, { moduleSettings: { observers: { eligibility: 'selected_users', roles: [], userIds: [randomUUID()] } } }, adminId))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('a session without an explicit policy takes the sheet geolocation, else the organization default', async () => {
    await prisma.checklistWorkplaceSettings.create({ data: { organizationId, moduleEnabled: true, defaultGeolocationPolicy: 'optional' } });
    const withOwn = await sheet({ defaultLocationCapturePolicy: 'required' });
    const inherits = await sheet();
    let n = 0;
    const make = async (checklistId: string) => {
      const learner = await prisma.user.create({ data: { organizationId, email: `g${++n}-${randomUUID()}@example.test`, passwordHash: 'x', firstName: 'G', lastName: `${n}` } });
      const instance = await checklistsService.assignChecklist(checklistId, organizationId, { userId: learner.id }, adminId);
      return sessionService.create(organizationId, { instanceId: instance.id, observerId, timezone: 'UTC' } as never, adminId);
    };
    expect((await make(withOwn.id)).locationCapturePolicy).toBe('required');
    expect((await make(inherits.id)).locationCapturePolicy).toBe('optional');
  });

  it('the feedback visibility of a sheet hides or shows the result to the learner', async () => {
    const hidden = await sheet();
    const shown = await sheet({ feedbackVisibilityOverride: 'live' });
    const learnerView = (visibility: Map<string, 'after_completion' | 'live'>) => ({ isLearnerOnly: true, feedbackVisibility: 'after_completion' as const, feedbackVisibilityBySheet: visibility });
    const prepare = async (checklist: { id: string; itemId: string }) => {
      // A second required criterion stays unanswered, so the instance is not completed yet.
      await prisma.checklistItem.create({ data: { organizationId, checklistId: checklist.id, order: 2, text: 'Open', points: 10, isRequired: true } });
      const instance = await checklistsService.assignChecklist(checklist.id, organizationId, { userId: learnerId }, observerId);
      const created = await sessionService.create(organizationId, { instanceId: instance.id, observerId, timezone: 'UTC' } as never, observerId);
      const started = await sessionService.transition(created.id, organizationId, 'start', created.version, observerId, {});
      await checklistsService.submitItemResult(instance.id, checklist.itemId, organizationId, observerId, true, { checked: true });
      return started.id;
    };
    const hiddenId = await prepare(hidden);
    const shownId = await prepare(shown);
    const overrides = await checklistsService.feedbackVisibilityOverrides(organizationId);
    expect((await sessionService.get(hiddenId, organizationId, {}, learnerView(overrides))).result.visible).toBe(false);
    expect((await sessionService.get(shownId, organizationId, {}, learnerView(overrides))).result.visible).toBe(true);
  });

  it('a copy keeps the overrides of the original', async () => {
    const { id } = await sheet({ highThresholdOverride: 60, lowThresholdOverride: 20, feedbackVisibilityOverride: 'live', observerEligibilityOverride: 'any_user' });
    const copy = await checklistsService.copyChecklist(id, organizationId, adminId);
    expect(copy.moduleSettings).toMatchObject({ thresholds: { high: 60, low: 20 }, feedbackVisibility: 'live', observers: { eligibility: 'any_user' } });
  });
});
