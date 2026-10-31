/// <reference types="jest" />
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service.js';
import { RolesGuard, type CurrentUser, type AuthenticatedRequest } from '../modules/auth/public.js';
import { CourseAccessGuard, CourseAccessPolicy } from '../modules/course-access/public.js';
import { CourseMaterialsService, MaterialMalwareScanService, MaterialMultipartUploadService } from '../modules/course-materials/public.js';
import { StandaloneMaterialGuard } from '../modules/course-materials/standalone-material.guard.js';
import { MaterialStorageLifecycleService } from '../modules/course-materials/material-storage-lifecycle.service.js';
import { UploadService } from '../modules/upload/public.js';
import { LongreadsService } from '../modules/longreads/longreads.service.js';
import { LongreadVersionsService } from '../modules/longreads/longread-versions.service.js';
import { LongreadReaderService } from '../modules/longreads/longread-reader.service.js';
import { LongreadFilesService } from '../modules/longreads/longread-files.service.js';
import { LongreadFilesController } from '../modules/longreads/longread-files.controller.js';
import { LongreadFileCleanupService } from '../modules/longreads/longread-file-cleanup.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';
import { officeZip } from './longread-files.fixtures.js';

const png = Buffer.from('89504e470d0a1a0a0000000049454e44', 'hex'), pdf = Buffer.from('%PDF-1.7\nsynthetic content\n%%EOF');
const image = (fileId: string) => ({ fileId, alt: 'Safety equipment', caption: 'Caption', width: 75, align: 'center' as const });

describe('longread files, scan pipeline, immutable references and live download access — database', () => {
  let prisma: PrismaService, drafts: LongreadsService, versions: LongreadVersionsService, reader: LongreadReaderService, files: LongreadFilesService, controller: LongreadFilesController, scanner: MaterialMalwareScanService, materials: CourseMaterialsService;
  let org: string, otherOrg: string, lessonId: string, courseId: string, docId: string;
  let admin: CurrentUser, instructor: CurrentUser, outsiderInstructor: CurrentUser, learner: CurrentUser, newLearner: CurrentUser, outsider: CurrentUser, foreign: CurrentUser;
  const objects = new Map<string, Buffer>(), deleted: string[] = [], inspected: number[] = [];
  let storage: UploadService;
  const oldEnv = { scanner: process.env['MALWARE_SCANNER_URL'], secret: process.env['MALWARE_SCANNER_CALLBACK_SECRET'] };
  async function user(roles: CurrentUser['roles'], organizationId = org) {
    const person = await prisma.user.create({ data: { organizationId, email: `${randomUUID()}@example.invalid`, passwordHash: 'unused', firstName: 'Media', lastName: 'Synthetic' } });
    await prisma.membership.createMany({ data: roles.map((role) => ({ organizationId, userId: person.id, role })) }); return { ...person, roles };
  }
  async function request(actor: CurrentUser, handler: (...args: never[]) => unknown) {
    const req = { currentUser: actor, params: { id: lessonId } } as unknown as AuthenticatedRequest;
    const context = { getHandler: () => handler, getClass: () => LongreadFilesController, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    await new RolesGuard(prisma, new Reflector()).canActivate(context); await new CourseAccessGuard(new Reflector(), new CourseAccessPolicy(prisma)).canActivate(context); return req;
  }
  async function create(name = 'picture.png', mimeType = 'image/png', bytes = png) { return (await files.create(lessonId, org, { files: [{ fileName: name, mimeType, sizeBytes: bytes.length }] }))[0]!; }
  async function clean(name = 'picture.png', mimeType = 'image/png', bytes = png) {
    const created = await create(name, mimeType, bytes);
    await files.upload(lessonId, created.id, org, { originalname: name, mimetype: mimeType, size: bytes.length, buffer: bytes } as Express.Multer.File);
    await scanner.applyVerdict(created.id, 'clean'); return created.id;
  }
  async function save(blocks: { type: string; content: Record<string, unknown>; hidden?: boolean }[], options: { cover?: string; chapterCover?: string; sequential?: boolean; second?: string; hidden?: string } = {}) {
    const draft = await drafts.getDraft(lessonId, org);
    return drafts.saveDraft(lessonId, org, { revision: draft.revision, settings: { ...draft.settings, readingOrder: options.sequential ? 'sequential' : 'free', cover: options.cover ? image(options.cover) : null }, chapters: [
      { id: draft.chapters[0]!.id, title: 'First', hidden: false, cover: options.chapterCover ? image(options.chapterCover) : null, blocks: blocks.map((block) => ({ ...block, schemaVersion: 1 })) },
      ...(options.second ? [{ title: 'Second', hidden: false, cover: image(options.second), blocks: [{ type: 'image', schemaVersion: 1, content: image(options.second) }] }] : []),
      ...(options.hidden ? [{ title: 'Secret', hidden: true, cover: image(options.hidden), blocks: [{ type: 'image', schemaVersion: 1, content: image(options.hidden) }] }] : []),
    ] }, admin.id);
  }
  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService(); await prisma.$connect();
    storage = {
      uploadMaterialFile: async (file: Express.Multer.File, organizationId: string, id: string) => { const key = `quarantine/organizations/${organizationId}/materials/${id}/${randomUUID()}`; objects.set(key, file.buffer); return { objectKey: key, fileName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size }; },
      getObjectRange: async (key: string, start: number, end: number) => { if (end - start >= 1024 * 1024) throw new Error('Unbounded read'); inspected.push(end - start + 1); return objects.get(key)!.subarray(start, end + 1); },
      promoteQuarantinedObject: async (key: string, organizationId: string, id: string) => { const next = `organizations/${organizationId}/materials/${id}/${randomUUID()}`; objects.set(next, objects.get(key)!); objects.delete(key); return next; },
      deleteObject: async (key: string) => { deleted.push(key); objects.delete(key); },
      getInlinePresignedUrl: async (key: string) => `https://files.example.invalid/${key}?inline=1`,
      getPresignedUrl: async (key: string) => `https://files.example.invalid/${key}?attachment=1`,
      createQuarantineObjectKey: (organizationId: string, id: string) => `quarantine/organizations/${organizationId}/materials/${id}/${randomUUID()}`,
      createMultipartUpload: async () => randomUUID(), getMultipartPartUrl: async () => 'https://files.example.invalid/part',
      completeMultipartUpload: async (key: string) => objects.get(key)!.length, abortMultipartUpload: async () => undefined,
      listObjects: async (prefix: string) => [...objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key, lastModified: new Date('2020-01-01') })),
    } as unknown as UploadService;
    drafts = new LongreadsService(prisma); versions = new LongreadVersionsService(prisma, drafts); reader = new LongreadReaderService(prisma, versions, drafts); materials = new CourseMaterialsService(prisma); scanner = new MaterialMalwareScanService(prisma, storage);
    files = new LongreadFilesService(prisma, drafts, reader, storage, materials, scanner, new MaterialMultipartUploadService(prisma, storage, materials, scanner)); controller = new LongreadFilesController(files);
    process.env['MALWARE_SCANNER_URL'] = 'https://scanner.example.invalid'; process.env['MALWARE_SCANNER_CALLBACK_SECRET'] = randomUUID();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    for (const [key, value] of Object.entries({ MALWARE_SCANNER_URL: oldEnv.scanner, MALWARE_SCANNER_CALLBACK_SECRET: oldEnv.secret })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    objects.clear(); deleted.length = 0; inspected.length = 0;
    org = (await prisma.organization.create({ data: { name: 'Media', slug: `media-${randomUUID()}`, longreadEnabled: true } })).id;
    otherOrg = (await prisma.organization.create({ data: { name: 'Other', slug: `media-${randomUUID()}`, longreadEnabled: true } })).id;
    admin = await user(['admin']); instructor = await user(['instructor']); outsiderInstructor = await user(['instructor']); learner = await user(['learner']); newLearner = await user(['learner']); outsider = await user(['learner']); foreign = await user(['admin'], otherOrg);
    courseId = (await prisma.course.create({ data: { organizationId: org, title: 'Media course', slug: randomUUID(), status: 'published' } })).id;
    await prisma.courseInstructor.create({ data: { organizationId: org, courseId, instructorId: instructor.id } });
    await prisma.assignment.createMany({ data: [learner, newLearner].map((person) => ({ organizationId: org, courseId, userId: person.id })) });
    lessonId = (await prisma.lesson.create({ data: { organizationId: org, courseId, title: 'Media lesson', slug: randomUUID(), type: 'longread', status: 'draft' } })).id;
    await prisma.$transaction((tx) => drafts.createForLesson(tx, org, lessonId)); docId = (await prisma.longreadDocument.findUniqueOrThrow({ where: { lessonId } })).id;
  });
  afterEach(async () => {
    for (const organizationId of [org, otherOrg]) {
      const where = { organizationId };
      await prisma.auditLog.deleteMany({ where }); await prisma.progress.deleteMany({ where }); await prisma.courseMaterial.deleteMany({ where });
      await prisma.longreadDocument.updateMany({ where, data: { publishedRevisionId: null } }); await prisma.longreadRevision.deleteMany({ where });
      await prisma.longreadDocument.deleteMany({ where }); await prisma.lesson.deleteMany({ where }); await prisma.assignment.deleteMany({ where }); await prisma.courseInstructor.deleteMany({ where }); await prisma.course.deleteMany({ where });
      await prisma.membership.deleteMany({ where }); await prisma.user.deleteMany({ where }); await prisma.organization.delete({ where: { id: organizationId } });
    }
  });
  it('accepts 20 files atomically, rejects 21 before writing, and has no document-wide count cap', async () => {
    const batch = Array.from({ length: 20 }, (_, i) => ({ fileName: `${i}.pdf`, mimeType: 'application/pdf', sizeBytes: pdf.length }));
    const req = await request(admin, controller.create);
    expect(() => controller.create(lessonId, { files: [...batch, batch[0]] }, req)).toThrow();
    expect(await prisma.courseMaterial.count({ where: { organizationId: org } })).toBe(0);
    expect(await controller.create(lessonId, { files: batch }, req)).toHaveLength(20);
    await files.create(lessonId, org, { files: batch }); expect(await prisma.courseMaterial.count({ where: { organizationId: org } })).toBe(40);
    await expect(files.create(lessonId, org, { files: [{ ...batch[0]!, sizeBytes: 50 * 1024 * 1024 + 1 }] })).rejects.toThrow(BadRequestException);
  });
  it('persists image/cover metadata and preserves a published file after replacing/removing draft references', async () => {
    const first = await clean(), next = await clean('next.png');
    const saved = await save([{ type: 'image', content: image(first) }], { cover: first, chapterCover: first });
    expect((await drafts.getDraft(lessonId, org)).chapters[0]!.cover).toEqual(image(first));
    await versions.publish(lessonId, org, saved.revision, admin.id);
    expect((await reader.read(lessonId, learner)).settings.cover).toEqual(image(first));
    const updated = await save([{ type: 'image', content: image(next) }]); await versions.publish(lessonId, org, updated.revision, admin.id);
    await expect(files.url(lessonId, first, learner, false, 1)).resolves.toMatchObject({ mimeType: 'image/png' });
    await expect(files.url(lessonId, first, newLearner, false, 2)).rejects.toThrow(NotFoundException);
    await expect(files.url(lessonId, next, newLearner, false, 2)).resolves.toMatchObject({ fileName: 'next.png' });
    const restored = await versions.restoreVersion(lessonId, org, 1, updated.revision, admin.id); expect(restored.settings.cover).toEqual(image(first)); expect(restored.chapters[0]!.cover).toEqual(image(first));
    await expect(files.upload(lessonId, first, org, { originalname: 'picture.png', mimetype: 'image/png', size: png.length, buffer: png } as Express.Multer.File)).rejects.toThrow(ConflictException);
  });
  it('uses real role/course guards and draft file preview does not create learning records', async () => {
    const id = await clean();
    const originalTtl = process.env['S3_PRESIGNED_TTL_SECONDS']; process.env['S3_PRESIGNED_TTL_SECONDS'] = '30';
    try { expect((await files.url(lessonId, id, admin, true)).expiresIn).toBe(30); } finally { if (originalTtl === undefined) delete process.env['S3_PRESIGNED_TTL_SECONDS']; else process.env['S3_PRESIGNED_TTL_SECONDS'] = originalTtl; }
    for (const author of [admin, instructor]) await expect(controller.preview(lessonId, id, await request(author, controller.preview))).resolves.toHaveProperty('url');
    expect(await prisma.progress.count({ where: { organizationId: org } })).toBe(0);
    expect(await prisma.assessmentAttempt.count({ where: { organizationId: org } })).toBe(0); expect(await prisma.certificate.count({ where: { organizationId: org } })).toBe(0);
    await expect(request(learner, controller.preview)).rejects.toThrow(ForbiddenException);
    await expect(request(outsiderInstructor, controller.preview)).rejects.toThrow(NotFoundException);
    await expect(controller.preview(lessonId, id, await request(foreign, controller.preview))).rejects.toThrow(NotFoundException);
  });
  it('never returns unscanned/infected/spoofed multipart files and prevents a second upload session', async () => {
    const id = (await create('fake.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', officeZip('wrong.xml'))).id;
    const session = await files.initiate(lessonId, id, org);
    await expect(files.initiate(lessonId, id, org)).rejects.toThrow(ConflictException);
    const row = await prisma.multipartUpload.findUniqueOrThrow({ where: { uploadId: session.uploadId } }); objects.set(row.objectKey, officeZip('wrong.xml'));
    await files.complete(lessonId, id, org, session.uploadId, { parts: [{ partNumber: 1, etag: 'synthetic' }] });
    await expect(files.url(lessonId, id, admin, true)).rejects.toThrow(NotFoundException);
    await scanner.applyVerdict(id, 'clean'); expect((await files.get(lessonId, id, org)).scanStatus).toBe('rejected'); expect(objects.has(row.objectKey)).toBe(false);
    const infected = await create(); await files.upload(lessonId, infected.id, org, { originalname: 'picture.png', mimetype: 'image/png', size: png.length, buffer: png } as Express.Multer.File);
    await scanner.applyVerdict(infected.id, 'infected'); await expect(files.url(lessonId, infected.id, admin, true)).rejects.toThrow(NotFoundException);
    const pending = (await create()).id; const draft = await save([{ type: 'image', content: image(pending) }]);
    expect((await versions.publishCheck(lessonId, org)).reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'file_unavailable' })]));
    await expect(versions.publish(lessonId, org, draft.revision, admin.id)).rejects.toThrow(UnprocessableEntityException);
  });
  it('checks entitlement and version on every signed-link request and hides locked/hidden chapter covers', async () => {
    const first = await clean(), second = await clean('second.png'), hidden = await clean('hidden.png');
    const draft = await save([{ type: 'image', content: image(first) }], { sequential: true, second, hidden }); await versions.publish(lessonId, org, draft.revision, admin.id);
    const view = await reader.read(lessonId, learner); expect(view.chapters[1]!.cover).toBeNull(); expect(JSON.stringify(view)).not.toContain(hidden);
    await expect(files.url(lessonId, second, learner, false, 1)).rejects.toThrow(NotFoundException);
    await expect(files.url(lessonId, hidden, learner, false, 1)).rejects.toThrow(NotFoundException);
    await reader.position(lessonId, learner, { version: 1, chapter: view.chapters[1]!.anchor, mode: 'navigate' });
    await expect(files.url(lessonId, second, learner, false, 1)).resolves.toHaveProperty('url');
    await expect(files.url(lessonId, second, learner, false, 99)).rejects.toThrow(NotFoundException);
    await expect(files.url(lessonId, first, outsider, false)).rejects.toThrow(NotFoundException);
    await expect(files.url(lessonId, first, foreign, false)).rejects.toThrow(NotFoundException);
    await prisma.assignment.updateMany({ where: { courseId, userId: learner.id }, data: { status: 'cancelled' } });
    await expect(files.url(lessonId, second, learner, false, 1)).rejects.toThrow(NotFoundException);
    await prisma.organization.update({ where: { id: org }, data: { longreadEnabled: false } }); await expect(files.url(lessonId, first, admin, true)).rejects.toThrow(NotFoundException);
  });
  it('blocks generic material APIs and rejects another document’s file reference without changing the draft', async () => {
    const id = await clean(); expect(await materials.listCourseMaterials(courseId, org)).toEqual([]);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ params: { id } }) }) } as unknown as ExecutionContext;
    await expect(new StandaloneMaterialGuard(materials).canActivate(ctx)).rejects.toThrow(NotFoundException);
    const another = await prisma.longreadDocument.create({ data: { organizationId: org, lessonId: (await prisma.lesson.create({ data: { organizationId: org, courseId, title: 'Another', slug: randomUUID(), type: 'longread' } })).id } });
    await prisma.courseMaterial.update({ where: { id }, data: { longreadDocumentId: another.id } });
    await expect(save([{ type: 'image', content: image(id) }])).rejects.toThrow(BadRequestException);
    expect((await drafts.getDraft(lessonId, org)).revision).toBe(1);
  });
  it('validates a large multipart object through bounded ranges after scanning', async () => {
    const bytes = Buffer.alloc(9 * 1024 * 1024); pdf.copy(bytes);
    const id = (await create('large.pdf', 'application/pdf', bytes)).id, session = await files.initiate(lessonId, id, org);
    expect(session.parts).toHaveLength(2);
    const row = await prisma.multipartUpload.findUniqueOrThrow({ where: { uploadId: session.uploadId } }); objects.set(row.objectKey, bytes);
    await files.complete(lessonId, id, org, session.uploadId, { parts: [{ partNumber: 1, etag: 'first' }, { partNumber: 2, etag: 'second' }] });
    await scanner.applyVerdict(id, 'clean'); expect(inspected.reduce((sum, size) => sum + size, 0)).toBe(8192);
    expect((await files.get(lessonId, id, org)).scanStatus).toBe('available');
    const draft = await save([{ type: 'attachments', content: { files: [{ fileId: id }] } }]); await versions.publish(lessonId, org, draft.revision, admin.id);
    await expect(files.url(lessonId, id, learner, false, 1)).resolves.toMatchObject({ sizeBytes: bytes.length });
  });
  it('normalizes UUID casing for file type checks and accessible references', async () => {
    const id = await clean();
    await expect(save([{ type: 'attachments', content: { files: [{ fileId: id.toUpperCase() }] } }])).rejects.toThrow(BadRequestException);
    const draft = await save([{ type: 'image', content: image(id.toUpperCase()) }]); await versions.publish(lessonId, org, draft.revision, admin.id);
    await expect(files.url(lessonId, id, learner, false, 1)).resolves.toHaveProperty('url');
  });
  it('marks an aborted upload rejected instead of leaving an endless pending scan', async () => {
    const id = (await create('aborted.pdf', 'application/pdf', pdf)).id, session = await files.initiate(lessonId, id, org);
    await files.abort(lessonId, id, org, session.uploadId);
    expect(await files.get(lessonId, id, org)).toMatchObject({ scanStatus: 'rejected', scanReason: 'upload_aborted' });
    await expect(files.url(lessonId, id, admin, true)).rejects.toThrow(NotFoundException);
    await expect(files.initiate(lessonId, id, org)).rejects.toThrow(ConflictException);
  });
  it('serializes orphan collection with a concurrent upload reservation', async () => {
    const id = (await create('racing.pdf', 'application/pdf', pdf)).id;
    await prisma.courseMaterial.update({ where: { id }, data: { updatedAt: new Date('2020-01-01') } });
    const [upload] = await Promise.allSettled([files.initiate(lessonId, id, org), new LongreadFileCleanupService(prisma).cleanup(false)]);
    const row = await prisma.courseMaterial.findUnique({ where: { id } });
    if (upload.status === 'fulfilled') { expect(row?.scanStatus).toBe('pending'); expect(await prisma.multipartUpload.count({ where: { materialId: id, status: 'pending' } })).toBe(1); }
    else { expect(upload.reason instanceof ConflictException || upload.reason instanceof NotFoundException).toBe(true); expect(row).toBeNull(); }
  });
  it('retains expired multipart tracking until the existing cleanup has aborted storage parts', async () => {
    const id = (await create('expired.pdf', 'application/pdf', pdf)).id, session = await files.initiate(lessonId, id, org);
    await prisma.courseMaterial.update({ where: { id }, data: { updatedAt: new Date('2020-01-01') } });
    await prisma.multipartUpload.update({ where: { uploadId: session.uploadId }, data: { expiresAt: new Date('2020-01-01') } });
    const cleanup = new LongreadFileCleanupService(prisma);
    expect((await cleanup.cleanup(false)).deleted).toEqual([]);
    expect(await prisma.multipartUpload.findUnique({ where: { uploadId: session.uploadId } })).not.toBeNull();
    await new MaterialMultipartUploadService(prisma, storage, materials, scanner).cleanupExpired(false);
    expect((await prisma.multipartUpload.findUniqueOrThrow({ where: { uploadId: session.uploadId } })).status).toBe('aborted');
    expect((await cleanup.cleanup(false)).deleted).toEqual([id]);
  });
  it('keeps every revision reference during orphan cleanup, including covers and removed attachments', async () => {
    const cover = await clean(), attachment = await clean('file.pdf', 'application/pdf', pdf), orphan = await clean('orphan.png');
    const saved = await save([{ type: 'attachments', content: { files: [{ fileId: attachment, label: 'Handbook' }] } }], { cover, chapterCover: cover }); await versions.publish(lessonId, org, saved.revision, admin.id);
    await save([{ type: 'paragraph', content: { runs: [{ text: 'No files in the draft' }] } }, { type: 'future_widget', content: { fileId: 'opaque non-file identifier' } }]);
    await prisma.courseMaterial.updateMany({ where: { organizationId: org }, data: { createdAt: new Date('2020-01-01'), updatedAt: new Date('2020-01-01') } });
    const cleanup = new LongreadFileCleanupService(prisma);
    expect((await cleanup.cleanup()).candidates).toEqual([orphan]); expect(await prisma.courseMaterial.count({ where: { longreadDocumentId: docId } })).toBe(3);
    expect((await cleanup.cleanup(false)).deleted).toEqual([orphan]);
    await new MaterialStorageLifecycleService(prisma, storage).cleanup({ dryRun: false });
    expect(await prisma.courseMaterial.count({ where: { longreadDocumentId: docId } })).toBe(2);
    await expect(files.url(lessonId, attachment, learner, false, 1)).resolves.toMatchObject({ mimeType: 'application/pdf' });
    await expect(files.url(lessonId, cover, learner, false, 1)).resolves.toHaveProperty('url');
  });
});
