/// <reference types="jest" />
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service.js';
import { RolesGuard } from '../modules/auth/roles.guard.js';
import type { AuthenticatedRequest, CurrentUser } from '../modules/auth/public.js';
import { CourseAccessGuard, CourseAccessPolicy } from '../modules/course-access/public.js';
import { LongreadsController } from '../modules/longreads/longreads.controller.js';
import { LongreadsService } from '../modules/longreads/longreads.service.js';
import { LongreadVersionsService } from '../modules/longreads/longread-versions.service.js';
import { LongreadReaderService } from '../modules/longreads/longread-reader.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

describe('longread reader and side-effect-free preview (PR 385) — database', () => {
  let prisma: PrismaService, drafts: LongreadsService, versions: LongreadVersionsService, reader: LongreadReaderService, controller: LongreadsController;
  let org: string, otherOrg: string, courseId: string, lessonId: string, anchors: string[], chapterIds: string[];
  let admin: CurrentUser, instructor: CurrentUser, unassignedInstructor: CurrentUser, learner: CurrentUser, secondLearner: CurrentUser, outsider: CurrentUser, foreign: CurrentUser;
  async function user(roles: CurrentUser['roles'], organizationId = org): Promise<CurrentUser> {
    const person = await prisma.user.create({ data: { organizationId, email: `${randomUUID()}@example.invalid`, passwordHash: 'unused', firstName: 'Reader', lastName: 'Synthetic' } });
    await prisma.membership.createMany({ data: roles.map((role) => ({ organizationId, userId: person.id, role })) });
    return { ...person, roles };
  }
  async function request(actor: CurrentUser, handler: (...args: never[]) => unknown) {
    const req = { currentUser: actor, params: { id: lessonId } } as unknown as AuthenticatedRequest;
    const context = { getHandler: () => handler, getClass: () => LongreadsController, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    await new RolesGuard(prisma, new Reflector()).canActivate(context);
    await new CourseAccessGuard(new Reflector(), new CourseAccessPolicy(prisma)).canActivate(context);
    return req;
  }
  const position = (chapter: string, headingIndex: number | null = null) => ({ version: 1, chapter, headingIndex, mode: 'navigate' as const });
  async function activity() {
    return { progress: await prisma.progress.findMany({ where: { organizationId: org } }), attempts: await prisma.assessmentAttempt.count({ where: { organizationId: org } }), certificates: await prisma.certificate.count({ where: { organizationId: org } }) };
  }
  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService(); await prisma.$connect(); drafts = new LongreadsService(prisma); versions = new LongreadVersionsService(prisma, drafts); reader = new LongreadReaderService(prisma, versions, drafts); controller = new LongreadsController(drafts, versions, reader);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    org = (await prisma.organization.create({ data: { name: 'Reader', slug: `reader-${randomUUID()}`, longreadEnabled: true } })).id;
    otherOrg = (await prisma.organization.create({ data: { name: 'Other reader', slug: `reader-other-${randomUUID()}`, longreadEnabled: true } })).id;
    admin = await user(['admin']); instructor = await user(['instructor']); unassignedInstructor = await user(['instructor']); learner = await user(['learner']); secondLearner = await user(['learner']); outsider = await user(['learner']); foreign = await user(['admin'], otherOrg);
    courseId = (await prisma.course.create({ data: { organizationId: org, title: 'Reader course', slug: `course-${randomUUID()}`, status: 'published' } })).id;
    await prisma.courseInstructor.create({ data: { organizationId: org, courseId, instructorId: instructor.id } });
    await prisma.assignment.createMany({ data: [learner, secondLearner].map((person) => ({ organizationId: org, courseId, userId: person.id })) });
    const lesson = await prisma.lesson.create({ data: { organizationId: org, courseId, title: 'Reading lesson', slug: `reader-${randomUUID()}`, type: 'longread', status: 'draft' } });
    lessonId = lesson.id; await prisma.$transaction((tx) => drafts.createForLesson(tx, org, lessonId));
    const initial = await drafts.getDraft(lessonId, org);
    const paragraph = (text: string) => ({ type: 'paragraph', schemaVersion: 1, content: { runs: [{ text }] } });
    const heading = (level: number, text: string) => ({ type: 'heading', schemaVersion: 1, content: { level, runs: [{ text }] } });
    const saved = await drafts.saveDraft(lessonId, org, { revision: 1, settings: { readingOrder: 'sequential', requiredChapters: 2, direction: 'ltr', allowCopy: true, tableOfContents: 'expanded' }, chapters: [
      { id: initial.chapters[0]!.id, title: 'First', hidden: false, blocks: [heading(2, 'First heading'), heading(3, 'Nested heading'), paragraph('First content'), { ...paragraph('HIDDEN BLOCK'), hidden: true }] },
      { title: 'Second', hidden: false, blocks: [heading(2, 'Second heading'), paragraph('Second content')] },
      { title: 'Third', hidden: false, blocks: [paragraph('Third content')] },
      { title: 'HIDDEN CHAPTER', hidden: true, blocks: [paragraph('HIDDEN CONTENT')] },
    ] }, admin.id);
    anchors = saved.chapters.map((chapter) => chapter.anchor); chapterIds = saved.chapters.map((chapter) => chapter.id);
    await versions.publish(lessonId, org, saved.revision, admin.id);
  });
  afterEach(async () => {
    for (const organizationId of [org, otherOrg]) {
      const where = { organizationId };
      await prisma.auditLog.deleteMany({ where }); await prisma.progress.deleteMany({ where });
      await prisma.longreadDocument.updateMany({ where, data: { publishedRevisionId: null } }); await prisma.longreadRevision.deleteMany({ where });
      await prisma.longreadBlock.deleteMany({ where }); await prisma.longreadChapter.deleteMany({ where }); await prisma.longreadDocument.deleteMany({ where });
      await prisma.lesson.deleteMany({ where }); await prisma.assignment.deleteMany({ where }); await prisma.courseInstructor.deleteMany({ where }); await prisma.course.deleteMany({ where });
      await prisma.membership.deleteMany({ where }); await prisma.user.deleteMany({ where }); await prisma.organization.delete({ where: { id: organizationId } });
    }
  });

  it('previews chapter two for authors without any progress, attempt, certificate or draft mutation', async () => {
    const before = await activity(), draft = await drafts.getDraft(lessonId, org);
    for (const actor of [admin, instructor]) {
      const value = await controller.preview(lessonId, { chapterId: chapterIds[1] }, await request(actor, controller.preview));
      expect(value.preview).toBe(true); expect(value.version).toBeNull(); expect(value.navigation.chapter).toBe(anchors[1]);
      expect(value.chapters).toHaveLength(3); expect(JSON.stringify(value)).not.toContain('HIDDEN');
    }
    expect(await activity()).toEqual(before); expect(await drafts.getDraft(lessonId, org)).toEqual(draft);
  });
  it('applies the real role and instructor course guards; preview never exposes a foreign/hidden chapter', async () => {
    await expect(request(learner, controller.preview)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(request(unassignedInstructor, controller.preview)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.preview(lessonId, {}, await request(foreign, controller.preview))).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.preview(lessonId, { chapterId: chapterIds[3] }, await request(admin, controller.preview))).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.preview(lessonId, { chapterId: randomUUID() }, await request(admin, controller.preview))).rejects.toBeInstanceOf(NotFoundException);
    expect((await activity()).progress).toHaveLength(0);
  });
  it('enforces sequential navigation on the server and never sends locked/hidden content', async () => {
    const first = await controller.readPublished(lessonId, {}, await request(learner, controller.readPublished));
    expect(first.navigation.chapter).toBe(anchors[0]); expect(first.chapters[1]!.blocks).toEqual([]);
    expect(JSON.stringify(first)).not.toMatch(/Second content|Third content|HIDDEN/);
    await expect(reader.read(lessonId, learner, anchors[1])).rejects.toBeInstanceOf(NotFoundException);
    await expect(reader.position(lessonId, learner, position(anchors[2]!))).rejects.toBeInstanceOf(NotFoundException);
    const second = await reader.position(lessonId, learner, position(anchors[1]!)); expect(second.navigation.chapter).toBe(anchors[1]);
    expect(second.chapters[1]!.blocks).not.toEqual([]); expect(second.chapters[2]!.blocks).toEqual([]);
    await expect(reader.position(lessonId, learner, position(anchors[3]!))).rejects.toBeInstanceOf(NotFoundException);
    await reader.position(lessonId, learner, position(anchors[2]!));
    const row = await prisma.progress.findFirstOrThrow({ where: { organizationId: org, userId: learner.id } });
    expect(row).toMatchObject({ status: 'in_progress', score: null, completedAt: null, longreadReadingState: { maxReached: 2 } });
  });
  it('restores the chapter/heading and rejects a late bookmark from the previous chapter', async () => {
    await reader.read(lessonId, learner);
    await reader.position(lessonId, learner, { ...position(anchors[0]!, 1), mode: 'bookmark' });
    expect((await reader.read(lessonId, learner)).navigation).toMatchObject({ chapter: anchors[0], headingIndex: 1 });
    await reader.position(lessonId, learner, position(anchors[1]!));
    await expect(reader.position(lessonId, learner, { ...position(anchors[0]!, 0), mode: 'bookmark' })).rejects.toBeInstanceOf(ConflictException);
    expect((await reader.read(lessonId, learner)).navigation.chapter).toBe(anchors[1]);
    await expect(reader.position(lessonId, learner, position(anchors[1]!, 1))).rejects.toBeInstanceOf(BadRequestException);
  });
  it('keeps unlocked navigation monotonic with two concurrent windows', async () => {
    await reader.read(lessonId, learner);
    await Promise.all([reader.position(lessonId, learner, position(anchors[1]!)), reader.position(lessonId, learner, position(anchors[0]!))]);
    const row = await prisma.progress.findFirstOrThrow({ where: { organizationId: org, userId: learner.id } });
    expect(row.longreadReadingState).toMatchObject({ maxReached: 1 });
    await expect(reader.read(lessonId, learner, anchors[1])).resolves.toBeDefined();
  });
  it('preserves the chapter URL after renaming and keeps a started learner pinned to their version', async () => {
    await reader.read(lessonId, learner); await reader.position(lessonId, learner, position(anchors[1]!));
    const draft = await drafts.getDraft(lessonId, org);
    const changed = await drafts.saveDraft(lessonId, org, { revision: draft.revision, settings: { ...draft.settings, readingOrder: 'free', direction: 'rtl' }, chapters: draft.chapters.map((chapter, index) => ({ id: chapter.id, title: index === 1 ? 'Renamed second' : chapter.title, hidden: chapter.hidden,
      blocks: chapter.blocks.map(({ id, type, schemaVersion, content, hidden, title }) => ({ id, type, schemaVersion, content, hidden, title })) })) }, admin.id);
    await versions.publish(lessonId, org, changed.revision, admin.id);
    const old = await reader.read(lessonId, learner, anchors[1]); const latest = await reader.read(lessonId, secondLearner, anchors[1]);
    expect(old.version).toBe(1); expect(old.chapters[1]!.title).toBe('Second');
    expect(latest.version).toBe(2); expect(latest.chapters[1]!.title).toBe('Renamed second'); expect(latest.settings.direction).toBe('rtl');
  });
  it('requires fresh course entitlement, honors self-enrollment, and hides deleted parents/disabled features', async () => {
    await expect(reader.read(lessonId, outsider)).rejects.toBeInstanceOf(NotFoundException);
    expect((await activity()).progress).toHaveLength(0);
    await reader.read(lessonId, learner);
    await prisma.assignment.updateMany({ where: { userId: learner.id, courseId }, data: { status: 'cancelled' } });
    await expect(reader.read(lessonId, learner)).rejects.toBeInstanceOf(NotFoundException);
    await expect(reader.position(lessonId, learner, position(anchors[1]!))).rejects.toBeInstanceOf(NotFoundException);
    await prisma.course.update({ where: { id: courseId }, data: { selfEnrollmentEnabled: true } });
    await expect(reader.read(lessonId, outsider)).resolves.toBeDefined();
    await prisma.organization.update({ where: { id: org }, data: { longreadEnabled: false } });
    await expect(reader.read(lessonId, outsider)).rejects.toBeInstanceOf(NotFoundException);
    await prisma.organization.update({ where: { id: org }, data: { longreadEnabled: true } });
    await prisma.course.update({ where: { id: courseId }, data: { deletedAt: new Date() } });
    await expect(reader.read(lessonId, outsider)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('rejects cross-tenant reads, forged reader state and stale versions', async () => {
    await expect(controller.readPublished(lessonId, {}, await request(foreign, controller.readPublished))).rejects.toBeInstanceOf(NotFoundException);
    const req = await request(learner, controller.saveReadingPosition);
    expect(() => controller.saveReadingPosition(lessonId, { ...position(anchors[0]!), maxReached: 100, userId: outsider.id }, req)).toThrow();
    await reader.read(lessonId, learner);
    await expect(reader.position(lessonId, learner, { ...position(anchors[0]!), version: 99 })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.progress.count({ where: { userId: outsider.id } })).toBe(0);
  });
});
