/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { LessonsService } from '../modules/lessons/lessons.service.js';
import { LongreadsService } from '../modules/longreads/longreads.service.js';
import { OrganizationsService } from '../modules/organizations/organizations.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 381 acceptance criteria, verified against real Postgres:
// - with the flag off creating or opening a longread is 404 and other lessons are unaffected;
// - a longread lesson gets a document with one empty chapter in the same transaction;
// - the draft is saved with an optimistic revision: a stale or racing save is 409, never lost silently;
// - chapters and blocks of another longread or organization cannot be touched;
// - a chapter is copied deeply with fresh ids; unknown block types survive a save.
describe('longreads (PR 381) — database', () => {
  let prisma: PrismaService;
  let lessons: LessonsService;
  let longreads: LongreadsService;
  let organizations: OrganizationsService;
  let organizationId: string;
  let otherOrganizationId: string;
  let courseId: string;
  let userId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    longreads = new LongreadsService(prisma);
    lessons = new LessonsService(prisma, undefined, longreads);
    organizations = new OrganizationsService(prisma, {} as UploadService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `LR ${runId}`, slug: `lr-${runId}` } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: `LR other ${runId}`, slug: `lro-${runId}` } })).id;
    userId = (await prisma.user.create({
      data: { organizationId, email: `lr-${runId}@example.test`, passwordHash: 'not-used', firstName: 'Lr', lastName: 'User' },
    })).id;
    courseId = (await prisma.course.create({ data: { organizationId, title: 'Course', slug: `course-${runId}` } })).id;
  });

  afterEach(async () => {
    for (const id of [organizationId, otherOrganizationId]) {
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await prisma.longreadBlock.deleteMany({ where: { organizationId: id } });
      await prisma.longreadChapter.deleteMany({ where: { organizationId: id } });
      await prisma.longreadDocument.deleteMany({ where: { organizationId: id } });
      await prisma.lesson.deleteMany({ where: { organizationId: id } });
      await prisma.course.deleteMany({ where: { organizationId: id } });
      await prisma.user.deleteMany({ where: { organizationId: id } });
      await prisma.organization.deleteMany({ where: { id } });
    }
  });

  const enable = (id = organizationId) => organizations.updateFeatures(id, { longreadEnabled: true }, userId);
  const createLongread = (slug = 'lr-one') =>
    lessons.createLesson({ organizationId, courseId, title: 'Longread', slug, type: 'longread', order: 0, status: 'draft' }, userId);
  const paragraph = (text: string, id?: string) => ({ ...(id ? { id } : {}), type: 'paragraph', schemaVersion: 1, content: { runs: [{ text }] } });

  it('is off by default: longread lessons cannot be created or opened, other lessons are unaffected', async () => {
    await expect(createLongread()).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.lesson.count({ where: { organizationId } })).toBe(0);

    const text = await lessons.createLesson({ organizationId, courseId, title: 'Plain', slug: 'plain', type: 'text', order: 0, status: 'draft' }, userId);
    expect(await lessons.listLessons(courseId, organizationId)).toHaveLength(1);
    await expect(lessons.getLesson(text.id, organizationId)).resolves.toMatchObject({ type: 'text' });

    await enable();
    const lesson = await createLongread();
    await organizations.updateFeatures(organizationId, { longreadEnabled: false }, userId);
    await expect(lessons.getLesson(lesson.id, organizationId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(longreads.getDraft(lesson.id, organizationId)).rejects.toBeInstanceOf(NotFoundException);
    expect((await lessons.listLessons(courseId, organizationId)).map((item) => item.id)).toEqual([text.id]);
  });

  it('creates the document with one empty chapter and audits the flag change', async () => {
    await enable();
    const lesson = await createLongread();
    const draft = await longreads.getDraft(lesson.id, organizationId);
    expect(draft.revision).toBe(1);
    expect(draft.chapters).toHaveLength(1);
    expect(draft.chapters[0]).toMatchObject({ blocks: [], hidden: false });
    expect(draft.settings).toMatchObject({ readingOrder: 'free', tableOfContents: 'expanded' });
    const audit = await prisma.auditLog.findMany({ where: { organizationId, action: 'organization.features_updated' } });
    expect(audit).toHaveLength(1);
  });

  it('saves chapters and blocks, bumps the revision and keeps ids stable', async () => {
    await enable();
    const lesson = await createLongread();
    const first = await longreads.getDraft(lesson.id, organizationId);
    const chapterId = first.chapters[0]!.id;
    const saved = await longreads.saveDraft(lesson.id, organizationId, {
      revision: 1,
      settings: { readingOrder: 'sequential', requiredChapters: 1, tableOfContents: 'off', direction: 'ltr', allowCopy: true },
      chapters: [
        { id: chapterId, title: 'Intro', hidden: false, blocks: [paragraph('Hello'), { type: 'future_widget', schemaVersion: 3, content: { a: 1 } }] },
        { title: 'Second', hidden: true, blocks: [] },
      ],
    }, userId);
    expect(saved.revision).toBe(2);
    expect(saved.settings.readingOrder).toBe('sequential');
    expect(saved.chapters.map((c) => c.title)).toEqual(['Intro', 'Second']);
    expect(saved.chapters[0]!.id).toBe(chapterId);
    expect(saved.chapters[0]!.blocks[1]).toMatchObject({ type: 'future_widget', known: false, content: { a: 1 }, schemaVersion: 3 });
    expect(new Set(saved.chapters.map((c) => c.anchor)).size).toBe(2);

    const blockId = saved.chapters[0]!.blocks[0]!.id;
    const next = await longreads.saveDraft(lesson.id, organizationId, {
      revision: 2,
      chapters: [{ id: chapterId, title: 'Intro 2', hidden: false, blocks: [paragraph('Changed', blockId)] }],
    }, userId);
    expect(next.revision).toBe(3);
    expect(next.chapters).toHaveLength(1);
    expect(next.chapters[0]!.blocks).toHaveLength(1);
    expect(next.chapters[0]!.blocks[0]).toMatchObject({ id: blockId, content: { runs: [{ text: 'Changed' }] } });
  });

  it('returns 409 for a stale revision and lets only one of two racing saves win', async () => {
    await enable();
    const lesson = await createLongread();
    const chapterId = (await longreads.getDraft(lesson.id, organizationId)).chapters[0]!.id;
    const save = (text: string, revision = 1) =>
      longreads.saveDraft(lesson.id, organizationId, { revision, chapters: [{ id: chapterId, title: text, hidden: false, blocks: [paragraph(text)] }] }, userId);

    const results = await Promise.allSettled([save('A'), save('B')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect((rejected.reason as ConflictException).getResponse()).toMatchObject({ currentRevision: 2 });

    await expect(save('C', 1)).rejects.toBeInstanceOf(ConflictException);
    const draft = await longreads.getDraft(lesson.id, organizationId);
    expect(draft.revision).toBe(2);
    expect(draft.chapters[0]!.blocks).toHaveLength(1);
  });

  it('rejects invalid blocks without changing the draft and foreign chapter or block ids', async () => {
    await enable();
    const lesson = await createLongread('lr-a');
    const other = await createLongread('lr-b');
    const chapterId = (await longreads.getDraft(lesson.id, organizationId)).chapters[0]!.id;
    const otherChapterId = (await longreads.getDraft(other.id, organizationId)).chapters[0]!.id;

    await expect(longreads.saveDraft(lesson.id, organizationId, {
      revision: 1,
      chapters: [{ id: chapterId, title: 'X', hidden: false, blocks: [{ type: 'paragraph', schemaVersion: 1, content: { runs: [{ text: 'x', href: 'javascript:alert(1)' }] } }] }],
    }, userId)).rejects.toBeInstanceOf(BadRequestException);
    await expect(longreads.saveDraft(lesson.id, organizationId, {
      revision: 1,
      chapters: [{ id: otherChapterId, title: 'X', hidden: false, blocks: [] }],
    }, userId)).rejects.toBeInstanceOf(BadRequestException);
    expect((await longreads.getDraft(lesson.id, organizationId)).revision).toBe(1);
    expect((await longreads.getDraft(other.id, organizationId)).chapters[0]!.id).toBe(otherChapterId);
  });

  it('does not expose a longread of another organization', async () => {
    await enable();
    await enable(otherOrganizationId);
    const lesson = await createLongread();
    await expect(longreads.getDraft(lesson.id, otherOrganizationId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(longreads.saveDraft(lesson.id, otherOrganizationId, { revision: 1, chapters: [{ title: 'X', hidden: false, blocks: [] }] }, userId))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(longreads.duplicateChapter(lesson.id, randomUUID(), otherOrganizationId, 1, userId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('copies a chapter deeply right after the original with fresh ids and a new revision', async () => {
    await enable();
    const lesson = await createLongread();
    const chapterId = (await longreads.getDraft(lesson.id, organizationId)).chapters[0]!.id;
    const innerId = randomUUID();
    await longreads.saveDraft(lesson.id, organizationId, {
      revision: 1,
      chapters: [
        { id: chapterId, title: 'One', hidden: false, blocks: [paragraph('A'), { type: 'future_widget', schemaVersion: 1, content: { id: innerId, items: [{ id: innerId }] } }] },
        { title: 'Two', hidden: false, blocks: [] },
      ],
    }, userId);

    await expect(longreads.duplicateChapter(lesson.id, chapterId, organizationId, 1, userId)).rejects.toBeInstanceOf(ConflictException);
    const copy = await longreads.duplicateChapter(lesson.id, chapterId, organizationId, 2, userId);
    expect(copy.revision).toBe(3);
    expect(copy.chapters.map((c) => c.title)).toEqual(['One', 'One (копия)', 'Two']);
    const [original, duplicate] = copy.chapters;
    expect(duplicate!.anchor).not.toBe(original!.anchor);
    expect(duplicate!.blocks.map((b) => b.id)).not.toEqual(original!.blocks.map((b) => b.id));
    const widget = duplicate!.blocks[1]!.content as { id: string; items: { id: string }[] };
    expect(widget.id).not.toBe(innerId);
    expect(widget.items[0]!.id).toBe(widget.id);
    expect((original!.blocks[1]!.content as { id: string }).id).toBe(innerId);
  });

  it('forbids switching a lesson to or from the longread type', async () => {
    await enable();
    const lesson = await createLongread();
    const text = await lessons.createLesson({ organizationId, courseId, title: 'Plain', slug: 'plain', type: 'text', order: 1, status: 'draft' }, userId);
    await expect(lessons.updateLesson(lesson.id, organizationId, { type: 'text' }, userId)).rejects.toBeInstanceOf(BadRequestException);
    await expect(lessons.updateLesson(text.id, organizationId, { type: 'longread' }, userId)).rejects.toBeInstanceOf(BadRequestException);
    await expect(lessons.updateLesson(lesson.id, organizationId, { title: 'Renamed', type: 'longread' }, userId)).resolves.toMatchObject({ title: 'Renamed' });
  });
});
