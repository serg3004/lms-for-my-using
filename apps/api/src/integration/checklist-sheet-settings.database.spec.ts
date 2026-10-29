/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 368, verified against real Postgres: the sheet-level "Skip" flag and the required feedback
// section are frozen into the instance snapshot at assignment, like the other builder settings.
describe('checklist sheet settings (PR 368) — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let sessionService: ChecklistSessionService;
  let organizationId: string;
  let learnerId: string;
  let observerId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
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
    organizationId = (await prisma.organization.create({ data: { name: `Sheet settings ${runId}`, slug: `sheet-settings-${runId}` } })).id;
    learnerId = (await prisma.user.create({ data: { organizationId, email: `l-${runId}@example.test`, passwordHash: 'x', firstName: 'L', lastName: 'Learner' } })).id;
    observerId = (await prisma.user.create({ data: { organizationId, email: `o-${runId}@example.test`, passwordHash: 'x', firstName: 'O', lastName: 'Observer' } })).id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });
  });

  afterEach(async () => {
    await prisma.checklistSessionEvent.deleteMany({ where: { organizationId } });
    await prisma.checklistSession.deleteMany({ where: { organizationId } });
    await prisma.checklistItemResult.deleteMany({ where: { organizationId } });
    await prisma.checklistInstance.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  async function assigned(settings: { feedbackRequired?: boolean; allowSkipAll?: boolean }) {
    const checklist = await prisma.checklist.create({ data: { organizationId, title: 'Sheet settings', status: 'published', ...settings } });
    const item = await prisma.checklistItem.create({ data: { organizationId, checklistId: checklist.id, order: 1, text: 'Criterion', points: 10, isRequired: false } });
    const instance = await checklistsService.assignChecklist(checklist.id, organizationId, { userId: learnerId }, observerId);
    const created = await sessionService.create(organizationId, { instanceId: instance.id, observerId }, observerId);
    const started = await sessionService.transition(created.id, organizationId, 'start', created.version, observerId, {});
    return { checklist, item, instance, session: started };
  }

  it('refuses to complete without strengths and development areas, then completes once they are saved', async () => {
    const { session } = await assigned({ feedbackRequired: true });

    await expect(sessionService.transition(session.id, organizationId, 'complete', session.version, observerId, {})).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    const withFeedback = await sessionService.submitFeedback(session.id, organizationId, { strengths: 'Tidy', developmentAreas: 'Labels', version: session.version }, observerId, {});
    const completed = await sessionService.transition(session.id, organizationId, 'complete', withFeedback.version, observerId, {});
    expect(completed.status).toBe('completed');
  });

  it('keeps the requirement the sheet had at assignment when it is edited afterwards', async () => {
    const off = await assigned({ feedbackRequired: false });
    await prisma.checklist.update({ where: { id: off.checklist.id }, data: { feedbackRequired: true } });
    const completed = await sessionService.transition(off.session.id, organizationId, 'complete', off.session.version, observerId, {});
    expect(completed.status).toBe('completed');
  });

  it('lets any criterion be skipped when the sheet allowed it at assignment, and only then', async () => {
    const on = await assigned({ allowSkipAll: true });
    await prisma.checklist.update({ where: { id: on.checklist.id }, data: { allowSkipAll: false } });
    await checklistsService.skipItem(on.instance.id, on.item.id, organizationId, observerId, true, {});
    const skipped = await prisma.checklistItemResult.findFirstOrThrow({ where: { instanceId: on.instance.id, itemId: on.item.id } });
    expect(skipped.answerState).toBe('skipped');
  });

  it('does not turn skipping on for an instance assigned while the flag was off', async () => {
    const off = await assigned({ allowSkipAll: false });
    await prisma.checklist.update({ where: { id: off.checklist.id }, data: { allowSkipAll: true } });
    await expect(checklistsService.skipItem(off.instance.id, off.item.id, organizationId, observerId, true, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a required feedback section on a sheet without the feedback section', async () => {
    const checklist = await prisma.checklist.create({ data: { organizationId, title: 'Consistency', status: 'draft' } });
    await expect(checklistsService.updateChecklist(checklist.id, organizationId, { feedbackEnabled: false, feedbackRequired: true })).rejects.toBeInstanceOf(BadRequestException);
  });
});
