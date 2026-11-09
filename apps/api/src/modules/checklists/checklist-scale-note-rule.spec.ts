import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import type { PrismaService } from '../../database/prisma.service.js';
import { ChecklistsService } from './checklists.service.js';
import { createChecklistScaleSchema, updateChecklistScaleSchema } from './checklists.schemas.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const scaleId = '22222222-2222-2222-2222-222222222222';
const otherScaleId = '33333333-3333-3333-3333-333333333333';
const checklistId = '44444444-4444-4444-4444-444444444444';

const levels = [{ value: 1, label: 'Да', score: 10 }, { value: 2, label: 'Нет', score: 0 }];

describe('scale default explanation rule (PR 457): schemas', () => {
  it('accepts answers that are levels of the scale and nothing else', () => {
    expect(createChecklistScaleSchema.safeParse({ name: 'Да/Нет', levels, noteRule: 'on_answers', noteAnswers: ['2'], noteRequired: true }).success).toBe(true);
    expect(createChecklistScaleSchema.safeParse({ name: 'Да/Нет', levels, noteRule: 'on_answers', noteAnswers: ['3'] }).success).toBe(false);
    expect(createChecklistScaleSchema.safeParse({ name: 'Да/Нет', levels, noteRule: 'on_answers', noteAnswers: [] }).success).toBe(false);
    expect(createChecklistScaleSchema.safeParse({ name: 'Да/Нет', levels, noteRule: 'always' }).success).toBe(false);
    expect(createChecklistScaleSchema.safeParse({ name: 'Да/Нет', levels }).success).toBe(true);
  });

  it('a scale update with the rule needs the answers too', () => {
    expect(updateChecklistScaleSchema.safeParse({ noteRule: 'on_answers' }).success).toBe(false);
    expect(updateChecklistScaleSchema.safeParse({ noteRule: 'off' }).success).toBe(true);
  });
});

function setup(options: { scale?: Record<string, unknown> | null; item?: Record<string, unknown> | null } = {}) {
  const scale = options.scale === undefined ? { noteRule: 'on_answers', noteAnswers: ['2'], noteRequired: true } : options.scale;
  const prisma = {
    checklistScale: { findFirst: jest.fn(async () => scale) },
    checklistScaleLevel: { findMany: jest.fn(async () => levels.map(({ value }) => ({ value }))) },
    checklistItem: {
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      findFirst: jest.fn(async () => options.item === undefined ? { id: 'i1', checklistId, scaleId: otherScaleId, noteRule: 'off', noteAnswers: null, noteRequired: false, allowSkip: false, autoSkipUnanswered: false } : options.item),
      updateMany: jest.fn(async () => ({ count: 2 })),
    },
  };
  const service = new ChecklistsService(prisma as unknown as PrismaService);
  jest.spyOn(service as unknown as { getChecklist: () => Promise<unknown> }, 'getChecklist').mockResolvedValue({ id: checklistId });
  return { prisma, service };
}

describe('scale default explanation rule (PR 457): criteria', () => {
  it('a new criterion with a scale and no rule of its own gets the rule of the scale', async () => {
    const { prisma, service } = setup();
    await service.createItem(checklistId, organizationId, { scaleId, text: 'Критерий', points: 0, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false, descriptionEnabled: false });
    expect(prisma.checklistItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ noteRule: 'on_answers', noteAnswers: ['2'], noteRequired: true }) });
  });

  it('a new criterion that sets its own rule keeps it', async () => {
    const { prisma, service } = setup();
    await service.createItem(checklistId, organizationId, { scaleId, text: 'Критерий', points: 0, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false, descriptionEnabled: false, noteRule: 'always', noteRequired: false });
    expect(prisma.checklistItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ noteRule: 'always', noteRequired: false }) });
  });

  it('a scale without a rule leaves the criterion at "off"', async () => {
    const { prisma, service } = setup({ scale: { noteRule: 'off', noteAnswers: null, noteRequired: false } });
    await service.createItem(checklistId, organizationId, { scaleId, text: 'Критерий', points: 0, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false, descriptionEnabled: false });
    expect(prisma.checklistItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ noteRule: 'off', noteRequired: false }) });
  });

  it('choosing another scale for a criterion without a rule copies the rule of that scale; a criterion with its own rule keeps it', async () => {
    const first = setup();
    await first.service.updateItem('i1', organizationId, { scaleId });
    expect(first.prisma.checklistItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ noteRule: 'on_answers', noteAnswers: ['2'], noteRequired: true }) }));

    const second = setup({ item: { id: 'i1', checklistId, scaleId: otherScaleId, noteRule: 'always', noteAnswers: null, noteRequired: false, allowSkip: false, autoSkipUnanswered: false } });
    await second.service.updateItem('i1', organizationId, { scaleId });
    expect(second.prisma.checklistItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { scaleId } }));
  });

  it('"apply to all" copies the rule to the other criteria of the sheet with the same scale only', async () => {
    const { prisma, service } = setup({ item: { id: 'i1', checklistId, scaleId, noteRule: 'on_answers', noteAnswers: ['2'], noteRequired: true } });
    await expect(service.applyNoteRuleToScale('i1', organizationId)).resolves.toEqual({ updated: 2 });
    expect(prisma.checklistItem.updateMany).toHaveBeenCalledWith({
      where: { organizationId, checklistId, scaleId, deletedAt: null, id: { not: 'i1' } },
      data: { noteRule: 'on_answers', noteAnswers: ['2'], noteRequired: true },
    });
  });

  it('"apply to all" needs a criterion with a scale', async () => {
    const { prisma, service } = setup({ item: { id: 'i1', checklistId, scaleId: null, noteRule: 'off', noteAnswers: null, noteRequired: false } });
    await expect(service.applyNoteRuleToScale('i1', organizationId)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.checklistItem.updateMany).not.toHaveBeenCalled();
  });
});
