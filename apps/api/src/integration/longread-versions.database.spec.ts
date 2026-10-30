/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { LessonsService } from '../modules/lessons/lessons.service.js';
import { LongreadVersionsService } from '../modules/longreads/longread-versions.service.js';
import { LongreadsService } from '../modules/longreads/longreads.service.js';
import { OrganizationsService } from '../modules/organizations/organizations.service.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 382 acceptance criteria, verified against real Postgres:
// - v1 published, draft edited: a learner sees v1; after v2 a new learner sees v2, the one who started stays on v1;
// - restoring v1 makes a new draft and leaves v1 and v2 untouched;
// - the draft, another organization, an unpublished or draft lesson are all the same 404 for a learner;
// - two racing publishes never duplicate a version number;
// - unpublishing stops new openings and keeps versions and learners' progress.
describe('longread versions (PR 382) — database', () => {
  let prisma: PrismaService;
  let lessons: LessonsService;
  let longreads: LongreadsService;
  let versions: LongreadVersionsService;
  let organizations: OrganizationsService;
  let organizationId: string;
  let otherOrganizationId: string;
  let courseId: string;
  let authorId: string;
  let learnerA: string;
  let learnerB: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    longreads = new LongreadsService(prisma);
    versions = new LongreadVersionsService(prisma, longreads);
    lessons = new LessonsService(prisma, undefined, longreads);
    organizations = new OrganizationsService(prisma, {} as UploadService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `LV ${runId}`, slug: `lv-${runId}`, longreadEnabled: true } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: `LV other ${runId}`, slug: `lvo-${runId}`, longreadEnabled: true } })).id;
    const user = async (name: string) =>
      (await prisma.user.create({ data: { organizationId, email: `${name}-${runId}@example.test`, passwordHash: 'not-used', firstName: name, lastName: 'User' } })).id;
    authorId = await user('Author');
    learnerA = await user('LearnerA');
    learnerB = await user('LearnerB');
    courseId = (await prisma.course.create({ data: { organizationId, title: 'Course', slug: `course-${runId}` } })).id;
  });

  afterEach(async () => {
    for (const id of [organizationId, otherOrganizationId]) {
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await prisma.progress.deleteMany({ where: { organizationId: id } });
      await prisma.longreadDocument.updateMany({ where: { organizationId: id }, data: { publishedRevisionId: null } });
      await prisma.longreadRevision.deleteMany({ where: { organizationId: id } });
      await prisma.longreadBlock.deleteMany({ where: { organizationId: id } });
      await prisma.longreadChapter.deleteMany({ where: { organizationId: id } });
      await prisma.longreadDocument.deleteMany({ where: { organizationId: id } });
      await prisma.lesson.deleteMany({ where: { organizationId: id } });
      await prisma.course.deleteMany({ where: { organizationId: id } });
      await prisma.user.deleteMany({ where: { organizationId: id } });
      await prisma.organization.deleteMany({ where: { id } });
    }
  });

  const paragraph = (text: string) => ({ type: 'paragraph', schemaVersion: 1, content: { runs: [{ text }] } });

  async function newLongread(slug = 'lr') {
    const lesson = await lessons.createLesson({ organizationId, courseId, title: 'Longread', slug, type: 'longread', order: 0, status: 'draft' }, authorId);
    const draft = await longreads.getDraft(lesson.id, organizationId);
    return { lessonId: lesson.id, chapterId: draft.chapters[0]!.id, revision: draft.revision };
  }

  /** Replaces the draft text; returns the new draft revision. */
  async function writeDraft(lessonId: string, chapterId: string, revision: number, text: string, extra: ReturnType<typeof paragraph>[] = []) {
    const saved = await longreads.saveDraft(lessonId, organizationId, {
      revision,
      chapters: [{ id: chapterId, title: 'Intro', hidden: false, blocks: [paragraph(text), ...extra] }],
    }, authorId);
    return saved.revision;
  }

  const textOf = (read: Awaited<ReturnType<LongreadVersionsService['readPublished']>>) =>
    (read.chapters[0]!.blocks[0]!.content as { runs: { text: string }[] }).runs[0]!.text;

  it('retains editor block labels/visibility in immutable versions and restored drafts', async () => {
    const { lessonId, chapterId } = await newLongread();
    const draft = await longreads.saveDraft(lessonId, organizationId, { revision: 1, chapters: [
      { id: chapterId, title: 'Intro', hidden: false, blocks: [
        { ...paragraph('Visible'), title: 'Visible label', hidden: false },
        { ...paragraph('Hidden'), title: 'Hidden label', hidden: true },
      ] },
    ] }, authorId);
    await versions.publish(lessonId, organizationId, draft.revision, authorId);
    const immutable = await prisma.longreadRevision.findFirstOrThrow({ where: { organizationId } });
    expect((immutable.snapshot as unknown as { blocks: object[] }[])[0]!.blocks).toMatchObject([
      { title: 'Visible label', hidden: false }, { title: 'Hidden label', hidden: true },
    ]);
    const changed = await longreads.saveDraft(lessonId, organizationId, { revision: draft.revision, chapters: [
      { id: chapterId, title: 'Changed', hidden: false, blocks: [paragraph('Replacement')] },
    ] }, authorId);
    const restored = await versions.restoreVersion(lessonId, organizationId, 1, changed.revision, authorId);
    expect(restored.chapters[0]!.blocks).toMatchObject([{ title: 'Visible label', hidden: false }, { title: 'Hidden label', hidden: true }]);
    expect((await prisma.longreadRevision.findUniqueOrThrow({ where: { id: immutable.id } })).snapshot).toEqual(immutable.snapshot);
  });

  it('restores a legacy snapshot without editor metadata using visible/unnamed defaults', async () => {
    const { lessonId } = await newLongread();
    const document = await prisma.longreadDocument.findUniqueOrThrow({ where: { lessonId } });
    await prisma.longreadRevision.create({ data: {
      organizationId, documentId: document.id, number: 1, schemaVersion: 1, sourceDraftRevision: 1,
      settings: document.settings!, snapshot: [{ title: 'Legacy', anchor: 'legacy', hidden: false, blocks: [paragraph('Legacy text')] }],
      createdById: authorId,
    } });
    const restored = await versions.restoreVersion(lessonId, organizationId, 1, 1, authorId);
    expect(restored.chapters[0]!.blocks[0]).toMatchObject({ title: null, hidden: false });
  });

  it('keeps a learner on the version they started and gives new learners the latest', async () => {
    const { lessonId, chapterId, revision } = await newLongread();
    let rev = await writeDraft(lessonId, chapterId, revision, 'one');
    expect(await versions.publish(lessonId, organizationId, rev, authorId)).toMatchObject({ version: 1 });

    rev = await writeDraft(lessonId, chapterId, rev, 'draft edit');
    expect(textOf(await versions.readPublished(lessonId, organizationId, learnerA))).toBe('one');

    expect(await versions.publish(lessonId, organizationId, rev, authorId)).toMatchObject({ version: 2 });
    const a = await versions.readPublished(lessonId, organizationId, learnerA);
    const b = await versions.readPublished(lessonId, organizationId, learnerB);
    expect([a.version, textOf(a)]).toEqual([1, 'one']);
    expect([b.version, textOf(b)]).toEqual([2, 'draft edit']);
    expect(await prisma.progress.count({ where: { organizationId, lessonId } })).toBe(2);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).status).toBe('published');
  });

  it('refuses to publish an unchanged draft and reports the version list with authors', async () => {
    const { lessonId, chapterId, revision } = await newLongread();
    const rev = await writeDraft(lessonId, chapterId, revision, 'one');
    await versions.publish(lessonId, organizationId, rev, authorId);
    await expect(versions.publish(lessonId, organizationId, rev, authorId)).rejects.toBeInstanceOf(ConflictException);
    await expect(versions.publish(lessonId, organizationId, rev + 5, authorId)).rejects.toBeInstanceOf(ConflictException);
    const history = await versions.listVersions(lessonId, organizationId);
    expect(history.versions).toEqual([{ number: 1, createdAt: expect.any(Date), author: { id: authorId, name: 'Author User' }, published: true }]);
  });

  it('restores an old version into a new draft without touching any version', async () => {
    const { lessonId, chapterId, revision } = await newLongread();
    let rev = await writeDraft(lessonId, chapterId, revision, 'one');
    await versions.publish(lessonId, organizationId, rev, authorId);
    rev = await writeDraft(lessonId, chapterId, rev, 'two');
    await versions.publish(lessonId, organizationId, rev, authorId);
    const before = await prisma.longreadRevision.findMany({ where: { organizationId }, orderBy: { number: 'asc' } });

    await expect(versions.restoreVersion(lessonId, organizationId, 1, rev - 1, authorId)).rejects.toBeInstanceOf(ConflictException);
    await expect(versions.restoreVersion(lessonId, organizationId, 9, rev, authorId)).rejects.toBeInstanceOf(NotFoundException);
    const draft = await versions.restoreVersion(lessonId, organizationId, 1, rev, authorId);
    expect(draft.revision).toBe(rev + 1);
    expect((draft.chapters[0]!.blocks[0]!.content as { runs: { text: string }[] }).runs[0]!.text).toBe('one');

    const after = await prisma.longreadRevision.findMany({ where: { organizationId }, orderBy: { number: 'asc' } });
    expect(after).toEqual(before);
    expect(textOf(await versions.readPublished(lessonId, organizationId, learnerB))).toBe('two');
    // The restored draft differs from v2, so it publishes as v3.
    expect(await versions.publish(lessonId, organizationId, draft.revision, authorId)).toMatchObject({ version: 3 });
  });

  it('returns every refusal reason and publishes nothing', async () => {
    const { lessonId, chapterId, revision } = await newLongread();
    await expect(versions.publish(lessonId, organizationId, revision, authorId)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(await versions.publishCheck(lessonId, organizationId)).toMatchObject({ ok: false, reasons: [{ code: 'empty_document' }] });

    const rev = await writeDraft(lessonId, chapterId, revision, 'text', [
      { type: 'future_widget', schemaVersion: 1, content: { a: 1 } },
      { type: 'paragraph', schemaVersion: 1, content: { runs: [{ text: 'go', href: '#ch-missing' }] } },
    ]);
    const check = await versions.publishCheck(lessonId, organizationId);
    expect(check.ok).toBe(false);
    expect(check.reasons.map((reason) => reason.code).sort()).toEqual(['broken_link', 'unknown_block']);
    await expect(versions.publish(lessonId, organizationId, rev, authorId)).rejects.toMatchObject({
      response: { reasons: expect.arrayContaining([expect.objectContaining({ code: 'unknown_block' })]) },
    });
    expect(await prisma.longreadRevision.count({ where: { organizationId } })).toBe(0);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).status).toBe('draft');
  });

  it('answers a learner with the same 404 for the draft, other tenants, unpublished and draft lessons', async () => {
    const { lessonId, chapterId, revision } = await newLongread();
    // Never published: the draft is not readable by the learner endpoint.
    await expect(versions.readPublished(lessonId, organizationId, learnerA)).rejects.toBeInstanceOf(NotFoundException);

    const rev = await writeDraft(lessonId, chapterId, revision, 'one');
    await versions.publish(lessonId, organizationId, rev, authorId);
    await expect(versions.readPublished(lessonId, otherOrganizationId, learnerA)).rejects.toBeInstanceOf(NotFoundException);
    await expect(versions.readPublished(randomUUID(), organizationId, learnerA)).rejects.toBeInstanceOf(NotFoundException);
    await expect(versions.publish(lessonId, otherOrganizationId, rev, authorId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(versions.listVersions(lessonId, otherOrganizationId)).rejects.toBeInstanceOf(NotFoundException);

    // Lesson taken out of "published" through the lessons API hides it as well.
    await lessons.updateLessonStatus(lessonId, organizationId, 'archived', authorId);
    await expect(versions.readPublished(lessonId, organizationId, learnerA)).rejects.toBeInstanceOf(NotFoundException);
    await lessons.updateLessonStatus(lessonId, organizationId, 'published', authorId);
    await expect(versions.readPublished(lessonId, organizationId, learnerA)).resolves.toMatchObject({ version: 1 });

    await organizations.updateFeatures(organizationId, { longreadEnabled: false }, authorId);
    await expect(versions.readPublished(lessonId, organizationId, learnerA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('unpublish blocks new openings and keeps versions and learner progress', async () => {
    const { lessonId, chapterId, revision } = await newLongread();
    const rev = await writeDraft(lessonId, chapterId, revision, 'one');
    await versions.publish(lessonId, organizationId, rev, authorId);
    await versions.readPublished(lessonId, organizationId, learnerA);

    await versions.unpublish(lessonId, organizationId, authorId);
    await expect(versions.readPublished(lessonId, organizationId, learnerA)).rejects.toBeInstanceOf(NotFoundException);
    await expect(versions.readPublished(lessonId, organizationId, learnerB)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.longreadRevision.count({ where: { organizationId } })).toBe(1);
    expect(await prisma.progress.count({ where: { organizationId, lessonId, userId: learnerA } })).toBe(1);
    expect((await versions.listVersions(lessonId, organizationId)).versions[0]!.published).toBe(false);

    // Switching back on needs no new version while the draft is unchanged.
    expect(await versions.publish(lessonId, organizationId, rev, authorId)).toMatchObject({ version: 1 });
    expect(await prisma.longreadRevision.count({ where: { organizationId } })).toBe(1);
    expect((await versions.readPublished(lessonId, organizationId, learnerA)).version).toBe(1);
  });

  it('two racing publishes of one draft produce one version; the loser gets 409', async () => {
    const { lessonId, chapterId, revision } = await newLongread();
    let rev = await writeDraft(lessonId, chapterId, revision, 'one');
    await versions.publish(lessonId, organizationId, rev, authorId);
    rev = await writeDraft(lessonId, chapterId, rev, 'two');

    const results = await Promise.allSettled([
      versions.publish(lessonId, organizationId, rev, authorId),
      versions.publish(lessonId, organizationId, rev, authorId),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    const numbers = (await prisma.longreadRevision.findMany({ where: { organizationId }, orderBy: { number: 'asc' } })).map((r) => r.number);
    expect(numbers).toEqual([1, 2]);
  });

  it('only the publish action can make a longread lesson published', async () => {
    await expect(
      lessons.createLesson({ organizationId, courseId, title: 'Direct', slug: 'direct', type: 'longread', order: 0, status: 'published' }, authorId),
    ).rejects.toBeInstanceOf(BadRequestException);
    const { lessonId } = await newLongread();
    await expect(lessons.updateLessonStatus(lessonId, organizationId, 'published', authorId)).rejects.toBeInstanceOf(BadRequestException);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).status).toBe('draft');
  });
});
