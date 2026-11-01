import { jest } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { questionTypeSchema } from '@lms/shared/assessment-question-types';
import { longreadCompletionInputSchema } from '@lms/shared/longread-progress';
import { KNOWN_BLOCK_TYPES, validateBlockContent } from './longread-blocks.js';
import { checkPublishable } from './longread-publish-check.js';
import { checkLongreadFiles } from './longread-file-references.js';
import { LongreadsService } from './longreads.service.js';
import { LongreadVersionsService } from './longread-versions.service.js';
import type { PrismaService } from '../../database/prisma.service.js';

/** PR 391 sentry: required capabilities must not silently disappear while isolated UI mocks stay green.
 * Actual publication/pinning/grading and HTTP guards are exercised by the real browser acceptance chain.
 */
describe('longread acceptance sentry (PR 391)', () => {
  it('keeps additive migrations for documents, versions, reading state, files and seven question types', () => {
    const root = new URL('../../../prisma/migrations/', import.meta.url);
    const migrations = readdirSync(root).filter((name) => /^20261030|^20261031/.test(name)).map((name) => readFileSync(new URL(`${name}/migration.sql`, root), 'utf8')).join('\n');
    for (const table of ['longread_documents', 'longread_chapters', 'longread_blocks', 'longread_revisions']) expect(migrations).toContain(`CREATE TABLE "${table}"`);
    for (const field of ['longread_enabled', 'longread_reading_state', 'longread_revision_id', 'longread_document_id', 'longread_block_id']) expect(migrations).toContain(`"${field}"`);
    for (const type of ['matching', 'ordering', 'fill_blank', 'short_answer']) expect(migrations).toContain(`ADD VALUE '${type}'`);
    const schema = readFileSync(new URL('../../../prisma/schema.prisma', import.meta.url), 'utf8');
    expect(schema).toMatch(/longreadEnabled\s+Boolean\s+@default\(false\)/);
  });

  it('retains every required registry block, all seven question types and server-only completion inputs', () => {
    expect(KNOWN_BLOCK_TYPES).toEqual(expect.arrayContaining(['paragraph', 'heading', 'list', 'quote', 'note', 'divider', 'code', 'table', 'columns', 'tabs', 'accordion', 'image', 'attachments', 'audio', 'video', 'embed', 'exercise', 'continue']));
    expect(questionTypeSchema.options).toEqual(['single_choice', 'multiple_choice', 'true_false', 'matching', 'ordering', 'fill_blank', 'short_answer']);
    expect(validateBlockContent('continue', { mode: 'correct', minViewSeconds: 30 }).ok).toBe(true);
    expect(validateBlockContent('paragraph', { html: '<script>bad()</script>' }).ok).toBe(false);
    expect(validateBlockContent('paragraph', { runs: [{ text: 'bad', href: 'javascript:bad()' }] }).ok).toBe(false);
    expect(longreadCompletionInputSchema.safeParse({ version: 1, chapter: 'intro', completedAt: '2000-01-01' }).success).toBe(false);
    expect(checkPublishable([{ title: 'Future', anchor: 'future', hidden: false, blocks: [{ type: 'future_block', schemaVersion: 1, content: {}, hidden: false }] }], {})).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unknown_block' })]));
  });

  it('fails closed on a disabled or missing organization and rejects it before any version lookup', async () => {
    let enabled: boolean | null = false;
    const db = { organization: { findFirst: async () => enabled === null ? null : { longreadEnabled: enabled } }, lesson: { findFirst: jest.fn() } };
    const drafts = new LongreadsService(db as unknown as PrismaService), versions = new LongreadVersionsService(db as unknown as PrismaService, drafts);
    for (const value of [false, null]) {
      enabled = value;
      await expect(versions.readPublished(randomUUID(), randomUUID(), randomUUID())).rejects.toMatchObject({ status: 404 });
    }
    expect(db.lesson.findFirst).not.toHaveBeenCalled();
    enabled = true; await expect(drafts.isEnabled(randomUUID())).resolves.toBe(true);
  });

  it('checks 100 blocks/20 attachments with one bounded metadata query and no object bytes', async () => {
    const files = Array.from({ length: 20 }, () => ({ id: randomUUID(), mimeType: 'application/pdf', scanStatus: 'available', objectKey: 'synthetic/key', status: 'active' }));
    const findMany = jest.fn<() => Promise<typeof files>>().mockResolvedValue(files), documentId = randomUUID();
    const blocks = [...Array.from({ length: 99 }, () => ({ type: 'paragraph', content: { runs: [{ text: 'Small text' }] } })), { type: 'attachments', content: { files: files.map(({ id }) => ({ fileId: id })) } }];
    const db = { courseMaterial: { findMany } } as unknown as Parameters<typeof checkLongreadFiles>[0];
    await expect(checkLongreadFiles(db, documentId, blocks, true)).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({ where: { id: { in: files.map(({ id }) => id) }, longreadDocumentId: documentId, deletedAt: null }, select: { id: true, mimeType: true, scanStatus: true, objectKey: true, status: true } });
  });
});
