/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { jest } from '@jest/globals';

import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistScaleService } from '../modules/checklists/checklist-scale.service.js';
import { renderSessionReportPdf } from '../modules/checklists/checklist-session-report-pdf.js';
import { buildSessionSummary } from '../modules/checklists/checklist-session-summary.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 370, verified against real Postgres: the detailed report is built from the same calculation
// as the session list, masks what the learner may not see yet, and never crosses tenants.
describe('checklist session report (PR 370) — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let sessionService: ChecklistSessionService;
  let scaleService: ChecklistScaleService;
  let organizationId: string;
  let learnerId: string;
  let observerId: string;
  const live = { isLearnerOnly: false, feedbackVisibility: 'live' as const };

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    checklistsService = new ChecklistsService(prisma, {} as UploadService);
    sessionService = new ChecklistSessionService(prisma, checklistsService);
    scaleService = new ChecklistScaleService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Report ${runId}`, slug: `report-${runId}` } })).id;
    learnerId = (await prisma.user.create({ data: { organizationId, email: `l-${runId}@example.test`, passwordHash: 'x', firstName: 'L', lastName: 'Learner' } })).id;
    observerId = (await prisma.user.create({ data: { organizationId, email: `o-${runId}@example.test`, passwordHash: 'x', firstName: 'O', lastName: 'Observer' } })).id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });
  });

  afterEach(async () => {
    await prisma.checklistScoreRevision.deleteMany({ where: { organizationId } });
    await prisma.checklistSessionEvent.deleteMany({ where: { organizationId } });
    await prisma.checklistSession.deleteMany({ where: { organizationId } });
    await prisma.checklistItemResult.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { organizationId } });
    await prisma.checklistItemGroup.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.checklistScaleLevel.deleteMany({ where: { organizationId } });
    await prisma.checklistScale.deleteMany({ where: { organizationId } });
    await prisma.departmentMembership.deleteMany({ where: { organizationId } });
    await prisma.department.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  // Group 1: one yes/no criterion (1 of 1). Group 2: three 0..3 criteria (3, 2, 0 of 9) and one skipped.
  // Ungrouped: one checkbox worth 5. Total 11 of 15 = 73%.
  async function startedSession() {
    const yesNo = await scaleService.create(organizationId, { name: 'Yes/No', levels: [{ value: 1, label: 'No', score: 0 }, { value: 2, label: 'Yes', score: 1 }] }, observerId);
    const zeroToThree = await scaleService.create(
      organizationId,
      { name: '0-3', levels: [0, 1, 2, 3].map((score) => ({ value: score + 1, label: `L${score}`, score })) },
      observerId,
    );
    const checklist = await prisma.checklist.create({ data: { organizationId, title: 'Report sheet', status: 'published', passThreshold: 70 } });
    const first = await prisma.checklistItemGroup.create({ data: { organizationId, checklistId: checklist.id, title: 'First', order: 1 } });
    const second = await prisma.checklistItemGroup.create({ data: { organizationId, checklistId: checklist.id, title: 'Second', order: 2 } });
    const make = (order: number, text: string, extra: Record<string, unknown>) =>
      prisma.checklistItem.create({ data: { organizationId, checklistId: checklist.id, order, text, points: 5, isRequired: true, ...extra } });
    const a1 = await make(1, 'A1', { groupId: first.id, scaleId: yesNo.id });
    const b1 = await make(2, 'B1', { groupId: second.id, scaleId: zeroToThree.id });
    const b2 = await make(3, 'B2', { groupId: second.id, scaleId: zeroToThree.id });
    const b3 = await make(4, 'B3', { groupId: second.id, scaleId: zeroToThree.id });
    const b4 = await make(5, 'B4', { groupId: second.id, scaleId: zeroToThree.id, allowSkip: true });
    const c1 = await make(6, 'C1', {});

    const instance = await checklistsService.assignChecklist(checklist.id, organizationId, { userId: learnerId }, observerId);
    const created = await sessionService.create(organizationId, { instanceId: instance.id, observerId, timezone: 'Asia/Almaty' } as never, observerId);
    const started = await sessionService.transition(created.id, organizationId, 'start', created.version, observerId, {});

    return { session: started, instanceId: instance.id, items: { a1, b1, b2, b3, b4, c1 } };
  }

  type Prepared = Awaited<ReturnType<typeof startedSession>>;

  async function answerAll({ session, instanceId, items }: Prepared) {
    const instance = { id: instanceId };
    const { a1, b1, b2, b3, b4, c1 } = items;
    await checklistsService.submitItemResult(instance.id, a1.id, organizationId, observerId, true, { scaleLevel: 2 });
    await checklistsService.submitItemResult(instance.id, b1.id, organizationId, observerId, true, { scaleLevel: 4, comment: 'Great' });
    await checklistsService.submitItemResult(instance.id, b2.id, organizationId, observerId, true, { scaleLevel: 3 });
    await checklistsService.submitItemResult(instance.id, b3.id, organizationId, observerId, true, { scaleLevel: 1 });
    await checklistsService.skipItem(instance.id, b4.id, organizationId, observerId, true, {});
    await checklistsService.submitItemResult(instance.id, c1.id, organizationId, observerId, true, { checked: true });

    const submittedFeedback = await sessionService.submitFeedback(session.id, organizationId, { strengths: 'Tidy', developmentAreas: 'Labels', version: session.version }, observerId, {});
    return { session: submittedFeedback, instanceId, items };
  }

  async function completedSession() {
    return answerAll(await startedSession());
  }

  async function complete(session: { id: string; version: number }) {
    return sessionService.transition(session.id, organizationId, 'complete', session.version, observerId, {});
  }

  it('reports groups, criteria and totals that equal the stored session score', async () => {
    const { session, instanceId } = await completedSession();
    await complete(session);
    const report = await sessionService.getReport(session.id, organizationId, {}, live, { id: observerId, isAdmin: false });

    const stored = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instanceId } });
    expect(report.visible).toBe(true);
    if (!report.visible) throw new Error('unreachable');
    expect(report.summary).toMatchObject({
      scored: true, totalScore: stored.totalScore, maxScore: stored.maxScore, percentage: stored.percentage,
      criteriaCount: 6, answeredCount: 5, skippedCount: 1, formula: 'snapshot', passThreshold: 70,
    });
    expect([report.summary.totalScore, report.summary.maxScore, report.summary.percentage]).toEqual([11, 15, 73]);
    expect(report.groups.map((group) => [group.number, group.title, group.score, group.maxScore, group.percentage])).toEqual([
      ['1', 'First', 1, 1, 100], ['2', 'Second', 5, 9, 56],
    ]);
    expect(report.criteria.map((criterion) => [criterion.number, criterion.text, criterion.state, criterion.score, criterion.maxScore])).toEqual([
      ['1.1', 'A1', 'answered', 1, 1], ['2.1', 'B1', 'answered', 3, 3], ['2.2', 'B2', 'answered', 2, 3],
      ['2.3', 'B3', 'answered', 0, 3], ['2.4', 'B4', 'skipped', null, null], ['1', 'C1', 'answered', 5, 5],
    ]);
    expect(report.criteria[1]).toMatchObject({ levelLabel: 'L3', comment: 'Great' });
    // Colours come from the frozen levels: best green, zero red, in between orange; skipped has none.
    expect(report.criteria.map((criterion) => criterion.color?.color ?? null)).toEqual(['#2E7D32', '#2E7D32', '#E65100', '#C62828', null, '#2E7D32']);
    expect(report.feedback).toEqual({ strengths: 'Tidy', developmentAreas: 'Labels', comment: null });

    // One calculation: the list shows the same percentage.
    const listed = await sessionService.list(organizationId, { page: 1, pageSize: 10 } as never, {}, live);
    expect(listed.items.find((item) => item.id === session.id)?.result.percentage).toBe(report.summary.percentage);
  });

  // PR 376: a session scored in Postgres reads the same on the screen data, in the summary table and in the PDF.
  it('gives the same totals, groups and criteria to the report, the summary table and the PDF', async () => {
    const { session } = await completedSession();
    await complete(session);
    const report = await sessionService.getReport(session.id, organizationId, {}, live, { id: observerId, isAdmin: false });
    if (!report.visible) throw new Error('unreachable');

    const { rows } = buildSessionSummary([report], 'ru');
    const column = rows.map((row) => String(row[0] ?? ''));
    expect(rows[8]?.[1]).toBe('73% · 11 из 15');
    for (const line of [...report.groups.map((g) => `${g.number} ${g.title}`), ...report.criteria.map((c) => `${c.number} ${c.text}`)]) {
      expect(column).toContain(line);
    }

    const trace: string[] = [];
    await renderSessionReportPdf(report, { locale: 'ru', photos: [], omittedPhotos: 0, compress: false, trace });
    const text = trace.join('\n');
    expect(text).toContain('Баллы: 11 / 15');
    expect(text).toContain('73%');
    for (const line of [...report.groups.map((g) => `${g.number}. ${g.title}`), ...report.criteria.map((c) => `${c.number}  ${c.text}`)]) {
      expect(text).toContain(line);
    }
  });

  it('hides the result from the learner until the instance is completed, then shows it', async () => {
    const prepared = await startedSession();
    const learner = { isLearnerOnly: true, feedbackVisibility: 'after_completion' as const };
    await checklistsService.submitItemResult(prepared.instanceId, prepared.items.a1.id, organizationId, observerId, true, { scaleLevel: 2 });
    await sessionService.submitFeedback(prepared.session.id, organizationId, { strengths: 'Tidy', developmentAreas: 'Labels', version: prepared.session.version }, observerId, {});

    const hidden = await sessionService.getReport(prepared.session.id, organizationId, {}, learner, { id: learnerId, isAdmin: false });
    expect(hidden).toMatchObject({ visible: false, summary: null, groups: [], criteria: [], feedback: null });
    expect(JSON.stringify(hidden)).not.toContain('Tidy');
    // The observer sees the same session in full.
    const observerView = await sessionService.getReport(prepared.session.id, organizationId, {}, { ...live, observerId }, { id: observerId, isAdmin: false });
    expect(observerView.visible).toBe(true);

    const { session } = await answerAll({ ...prepared, session: await sessionService.get(prepared.session.id, organizationId, {}, live) as never });
    await complete(session);
    const shown = await sessionService.getReport(session.id, organizationId, {}, learner, { id: learnerId, isAdmin: false });
    expect(shown.visible).toBe(true);
    expect(shown.criteria).toHaveLength(6);
  });

  it('does not exist for another organization', async () => {
    const { session } = await completedSession();
    const other = await prisma.organization.create({ data: { name: 'Other', slug: `other-${randomUUID()}` } });
    try {
      await expect(sessionService.getReport(session.id, other.id, {}, live, { id: observerId, isAdmin: true })).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await prisma.organization.delete({ where: { id: other.id } });
    }
  });

  it('follows the formula of the latest recalculation and still equals the stored score', async () => {
    const { session, instanceId } = await completedSession();
    await complete(session);
    await sessionService.recalculateScore(session.id, organizationId, 'Count marks', observerId, {}, undefined, 'criteria');

    const report = await sessionService.getReport(session.id, organizationId, {}, live, { id: observerId, isAdmin: true });
    const stored = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instanceId } });
    if (!report.visible) throw new Error('unreachable');
    expect(report.summary.formula).toBe('criteria');
    expect(report.summary.totalScore).toBe(stored.totalScore);
    expect(report.summary.maxScore).toBe(stored.maxScore);
    expect(report.criteria.reduce((sum, criterion) => sum + (criterion.score ?? 0), 0)).toBe(stored.totalScore);
    expect(report.criteria.reduce((sum, criterion) => sum + (criterion.maxScore ?? 0), 0)).toBe(stored.maxScore);
  });

  it('colours the total by the configured ranges and shows the primary departments', async () => {
    // PR 397: the ranges and colours are frozen when the session completes, so they are configured first.
    await prisma.checklistWorkplaceSettings.create({ data: { organizationId, highPerformanceThreshold: 90, lowThreshold: 80, resultColorLow: '#112233' } });
    const { session } = await completedSession();
    await complete(session);
    const department = await prisma.department.create({ data: { organizationId, name: 'Sales' } });
    await prisma.departmentMembership.create({ data: { organizationId, userId: learnerId, departmentId: department.id, isPrimary: true } });

    const report = await sessionService.getReport(session.id, organizationId, {}, live, { id: observerId, isAdmin: true });
    if (!report.visible) throw new Error('unreachable');
    expect(report.summary.color?.color).toBe('#112233'); // 73% is below the low threshold 80
    expect(report.header.learner.department).toEqual({ id: department.id, name: 'Sales' });
    expect(report.header.observer.department).toBeNull();
    expect(report.header.timezone).toBe('Asia/Almaty');
  });

  // ---- PR 372: PDF of the report ----
  describe('PDF download (PR 372)', () => {
    const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const readPhoto = jest.fn(async () => PIXEL as Buffer | null);
    let pdfService: ChecklistSessionService;
    const actor = { id: '', isAdmin: false, locale: 'ru' as string | null };

    beforeEach(() => {
      readPhoto.mockClear();
      const uploads = { getObjectBytes: readPhoto } as unknown as UploadService;
      pdfService = new ChecklistSessionService(prisma, new ChecklistsService(prisma, uploads));
      actor.id = observerId;
    });

    const pdfPages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\n/g) ?? []).length;

    it('downloads the PDF of a completed session and audits it without the content', async () => {
      const { session } = await completedSession();
      await complete(session);
      const { pdf, filename } = await pdfService.getReportPdf(session.id, organizationId, {}, live, actor);

      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(filename).toBe(`checklist-session-${session.id}.pdf`);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId, action: 'checklist_session.report_pdf_downloaded' } });
      expect(audit).toMatchObject({ actorId: observerId, targetType: 'checklist_session', targetId: session.id });
      expect(audit.metadata).toMatchObject({ locale: 'ru', bytes: pdf.length, photosEmbedded: 0, photosOmitted: 0 });
      expect(JSON.stringify(audit.metadata)).not.toContain('Tidy');
    });

    it('is not found outside the caller scope or tenant, and leaves no audit entry', async () => {
      const { session } = await completedSession();
      await complete(session);
      await expect(pdfService.getReportPdf(session.id, organizationId, { observerId: randomUUID() }, live, actor)).rejects.toBeInstanceOf(NotFoundException);
      const other = await prisma.organization.create({ data: { name: 'Other', slug: `other-${randomUUID()}` } });
      try {
        await expect(pdfService.getReportPdf(session.id, other.id, {}, live, { ...actor, isAdmin: true })).rejects.toBeInstanceOf(NotFoundException);
      } finally {
        await prisma.organization.delete({ where: { id: other.id } });
      }
      expect(await prisma.auditLog.count({ where: { organizationId, action: 'checklist_session.report_pdf_downloaded' } })).toBe(0);
    });

    it('gives a learner whose result is still hidden a header-only file', async () => {
      const prepared = await startedSession();
      const learner = { isLearnerOnly: true, feedbackVisibility: 'after_completion' as const };
      const { pdf } = await pdfService.getReportPdf(prepared.session.id, organizationId, {}, learner, { id: learnerId, isAdmin: false, locale: 'en' });
      expect(pdfPages(pdf)).toBe(1);
      expect(readPhoto).not.toHaveBeenCalled();
    });

    it('embeds photos and survives a 30-photo session within the limits', async () => {
      const checklist = await prisma.checklist.create({ data: { organizationId, title: 'Photo sheet', status: 'published', passThreshold: 70 } });
      const items = [];
      for (let order = 1; order <= 30; order += 1) {
        items.push(await prisma.checklistItem.create({ data: { organizationId, checklistId: checklist.id, order, text: `Spot ${order}`, points: 1, isRequired: true } }));
      }
      const instance = await checklistsService.assignChecklist(checklist.id, organizationId, { userId: learnerId }, observerId);
      const created = await sessionService.create(organizationId, { instanceId: instance.id, observerId, timezone: 'UTC' } as never, observerId);
      await sessionService.transition(created.id, organizationId, 'start', created.version, observerId, {});
      await prisma.checklistItemResult.createMany({
        data: items.map((item) => ({
          organizationId, instanceId: instance.id, itemId: item.id, checked: true, points: 1, answerState: 'answered' as const,
          photoObjectKey: `photos/${item.id}`, photoMimeType: 'image/png', photoFileName: `${item.order}.png`,
        })),
      });

      const started = Date.now();
      const { pdf } = await pdfService.getReportPdf(created.id, organizationId, {}, live, actor);
      expect(Date.now() - started).toBeLessThan(30_000);
      expect(readPhoto).toHaveBeenCalledTimes(30);
      expect(pdf.length).toBeLessThan(25 * 1024 * 1024);
      expect(pdfPages(pdf)).toBeGreaterThanOrEqual(2);
      expect(pdf.toString('latin1').match(/\/Subtype \/Image/g)?.length ?? 0).toBeGreaterThanOrEqual(30);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId, action: 'checklist_session.report_pdf_downloaded' } });
      expect(audit.metadata).toMatchObject({ photosEmbedded: 30, photosOmitted: 0 });
    });

    it('counts photos above the limit as omitted instead of failing', async () => {
      const checklist = await prisma.checklist.create({ data: { organizationId, title: 'Many photos', status: 'published', passThreshold: 70 } });
      const items = [];
      for (let order = 1; order <= 43; order += 1) {
        items.push(await prisma.checklistItem.create({ data: { organizationId, checklistId: checklist.id, order, text: `Spot ${order}`, points: 1, isRequired: true } }));
      }
      const instance = await checklistsService.assignChecklist(checklist.id, organizationId, { userId: learnerId }, observerId);
      const created = await sessionService.create(organizationId, { instanceId: instance.id, observerId, timezone: 'UTC' } as never, observerId);
      await sessionService.transition(created.id, organizationId, 'start', created.version, observerId, {});
      await prisma.checklistItemResult.createMany({
        data: items.map((item) => ({
          organizationId, instanceId: instance.id, itemId: item.id, checked: true, points: 1, answerState: 'answered' as const,
          photoObjectKey: `photos/${item.id}`, photoMimeType: 'image/png', photoFileName: `${item.order}.png`,
        })),
      });
      await pdfService.getReportPdf(created.id, organizationId, {}, live, actor);
      expect(readPhoto).toHaveBeenCalledTimes(40);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId, action: 'checklist_session.report_pdf_downloaded' } });
      expect(audit.metadata).toMatchObject({ photosEmbedded: 40, photosOmitted: 3 });
    });
  });
});
