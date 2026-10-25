/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { CHECKLIST_TEMPLATES } from '../modules/checklists/checklist-templates.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 341 acceptance criteria, verified against real Postgres: a template creates an independent
// draft in the caller's organization with groups, criteria and settings; a copy of that draft shares
// nothing with it; unknown keys are rejected.
describe('checklist templates (PR 341) — database', () => {
  let prisma: PrismaService;
  let checklistsService: ChecklistsService;
  let organizationId: string;
  let actorId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    checklistsService = new ChecklistsService(prisma, {} as UploadService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Checklist templates ${runId}`, slug: `checklist-templates-${runId}` },
    });
    organizationId = organization.id;
    const actor = await prisma.user.create({
      data: { organizationId, email: `actor-${runId}@example.test`, passwordHash: 'unused', firstName: 'Actor', lastName: 'One' },
    });
    actorId = actor.id;
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { organizationId } });
    await prisma.checklistItemGroup.deleteMany({ where: { organizationId } });
    await prisma.checklist.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('creates a draft with groups, criteria and settings for every template, in all four languages', async () => {
    for (const template of CHECKLIST_TEMPLATES) {
      for (const locale of ['ru', 'en', 'kk', 'zh'] as const) {
        const created = await checklistsService.createFromTemplate(template.key, locale, organizationId, actorId);
        const expectedItems = template.groups.reduce((sum, group) => sum + group.items.length, 0);
        expect(created.status).toBe('draft');
        expect(created.scoringMode).toBe(template.scoringMode);
        expect(created.passThreshold).toBe(template.passThreshold);
        expect(created.title).toBe(template.title[locale]);

        const groups = await prisma.checklistItemGroup.findMany({ where: { checklistId: created.id }, orderBy: { order: 'asc' } });
        const items = await prisma.checklistItem.findMany({ where: { checklistId: created.id }, orderBy: { order: 'asc' } });
        expect(groups).toHaveLength(template.groups.length);
        expect(items).toHaveLength(expectedItems);
        expect(items.every((item) => item.groupId !== null && groups.some((group) => group.id === item.groupId))).toBe(true);
        expect(items.map((item) => item.order)).toEqual(items.map((_, index) => index));
        if (template.scoringMode === 'sum_points') {
          expect(items.every((item) => item.points > 0)).toBe(true);
        }
      }
    }
  });

  it('records an audit event and rejects unknown template keys', async () => {
    const created = await checklistsService.createFromTemplate('shift-opening', 'en', organizationId, actorId);
    const events = await prisma.auditLog.findMany({ where: { organizationId, action: 'checklist.created_from_template' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.targetId).toBe(created.id);

    await expect(checklistsService.createFromTemplate('does-not-exist', 'en', organizationId, actorId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a copy of a template sheet is independent of the original', async () => {
    const original = await checklistsService.createFromTemplate('workplace-safety', 'ru', organizationId, actorId);
    const copy = await checklistsService.copyChecklist(original.id, organizationId, actorId);
    expect(copy.id).not.toBe(original.id);

    await prisma.checklistItem.updateMany({ where: { checklistId: original.id }, data: { text: 'changed' } });

    const copiedItems = await prisma.checklistItem.findMany({ where: { checklistId: copy.id } });
    expect(copiedItems.length).toBeGreaterThan(0);
    expect(copiedItems.every((item) => item.text !== 'changed')).toBe(true);
  });
});
