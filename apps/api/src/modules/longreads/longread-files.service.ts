import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../../database/prisma.service.js';
import { CourseMaterialsService, MaterialMalwareScanService, MaterialMultipartUploadService } from '../course-materials/public.js';
import { UploadService, collectFileIds, isLongreadImage, validateLongreadFileMetadata, validateUploadFile } from '../upload/public.js';
import type { CurrentUser } from '../auth/public.js';
import { LongreadsService } from './longreads.service.js';
import { LongreadReaderService } from './longread-reader.service.js';

export const createLongreadFilesSchema = z.object({ files: z.array(z.object({ fileName: z.string().min(1).max(255), mimeType: z.string().min(1), sizeBytes: z.number().int().positive() }).strict()).min(1).max(20) }).strict();
const descriptor = { id: true, fileName: true, mimeType: true, sizeBytes: true, scanStatus: true, scanReason: true } as const;

@Injectable()
export class LongreadFilesService {
  constructor(private readonly prisma: PrismaService, private readonly drafts: LongreadsService, private readonly reader: LongreadReaderService,
    private readonly storage: UploadService, private readonly materials: CourseMaterialsService, private readonly scanner: MaterialMalwareScanService, private readonly multipart: MaterialMultipartUploadService) {}
  private async document(lessonId: string, organizationId: string) {
    await this.drafts.ensureEnabled(organizationId);
    const doc = await this.prisma.longreadDocument.findFirst({ where: { lessonId, organizationId, lesson: { deletedAt: null, course: { deletedAt: null } } }, select: { id: true, lesson: { select: { courseId: true } } } });
    if (!doc) throw new NotFoundException('Longread not found'); return doc;
  }
  private async owned(lessonId: string, fileId: string, organizationId: string) {
    const doc = await this.document(lessonId, organizationId);
    const file = await this.prisma.courseMaterial.findFirst({ where: { id: fileId, organizationId, longreadDocumentId: doc.id, deletedAt: null } });
    if (!file) throw new NotFoundException('Longread file not found'); return file;
  }
  async create(lessonId: string, organizationId: string, input: z.infer<typeof createLongreadFilesSchema>) {
    input.files.forEach((file) => validateLongreadFileMetadata(file.fileName, file.mimeType, file.sizeBytes));
    const doc = await this.document(lessonId, organizationId);
    return this.prisma.$transaction(input.files.map((file) => this.prisma.courseMaterial.create({ data: { ...file, organizationId, courseId: doc.lesson.courseId, lessonId, longreadDocumentId: doc.id, title: file.fileName, slug: `longread-${randomUUID()}`, kind: 'file', status: 'active' }, select: descriptor })));
  }
  async get(lessonId: string, fileId: string, organizationId: string) {
    const file = await this.owned(lessonId, fileId, organizationId);
    return { id: file.id, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, scanStatus: file.scanStatus, scanReason: file.scanReason };
  }
  private async reserve(lessonId: string, fileId: string, organizationId: string) {
    const file = await this.owned(lessonId, fileId, organizationId);
    return this.prisma.$transaction(async (tx) => {
      // The same lock as save/publish/cleanup: a newly reserved upload must not be collected as an old orphan.
      await tx.$queryRaw`SELECT id FROM longread_documents WHERE id = ${file.longreadDocumentId}::uuid FOR UPDATE`;
      const reserved = await tx.courseMaterial.updateMany({ where: { id: file.id, scanStatus: null, objectKey: null, quarantineKey: null }, data: { scanStatus: 'pending', scanExpiresAt: new Date(Date.now() + 24 * 3600_000) } });
      if (reserved.count !== 1) throw new ConflictException('Files are immutable; upload a new file to replace this one');
      return file;
    });
  }
  async upload(lessonId: string, fileId: string, organizationId: string, file: Express.Multer.File) {
    const expected = await this.owned(lessonId, fileId, organizationId);
    validateLongreadFileMetadata(file.originalname, file.mimetype, file.size); validateUploadFile(file);
    if (expected.fileName !== file.originalname || expected.mimeType !== file.mimetype || expected.sizeBytes !== file.size) throw new BadRequestException('Uploaded file differs from declared metadata');
    await this.reserve(lessonId, fileId, organizationId);
    try {
      const result = await this.storage.uploadMaterialFile(file, organizationId, fileId);
      await this.materials.attachUploadedFile(fileId, organizationId, result); await this.scanner.dispatch(fileId);
    } catch (error) { await this.prisma.courseMaterial.updateMany({ where: { id: fileId, scanStatus: 'pending', quarantineKey: null }, data: { scanStatus: 'rejected', scanReason: 'upload_failed' } }); throw error; }
    return this.get(lessonId, fileId, organizationId);
  }
  async initiate(lessonId: string, fileId: string, organizationId: string) {
    const file = await this.reserve(lessonId, fileId, organizationId);
    try { return await this.multipart.initiate(fileId, organizationId, { fileName: file.fileName!, mimeType: file.mimeType!, sizeBytes: file.sizeBytes! }); }
    catch (error) { await this.prisma.courseMaterial.updateMany({ where: { id: fileId, scanStatus: 'pending', quarantineKey: null }, data: { scanStatus: 'rejected', scanReason: 'upload_failed' } }); throw error; }
  }
  async complete(lessonId: string, fileId: string, organizationId: string, uploadId: string, input: { parts: { partNumber: number; etag: string }[] }) {
    await this.owned(lessonId, fileId, organizationId); await this.multipart.complete(fileId, organizationId, uploadId, input);
    return this.get(lessonId, fileId, organizationId);
  }
  async abort(lessonId: string, fileId: string, organizationId: string, uploadId: string) {
    await this.owned(lessonId, fileId, organizationId);
    const result = await this.multipart.abort(fileId, organizationId, uploadId);
    await this.prisma.courseMaterial.updateMany({ where: { id: fileId, scanStatus: 'pending', quarantineKey: null }, data: { scanStatus: 'rejected', scanReason: 'upload_aborted', scanExpiresAt: null } });
    return result;
  }
  async url(lessonId: string, fileId: string, actor: CurrentUser, preview: boolean, version?: number) {
    const file = await this.owned(lessonId, fileId, actor.organizationId);
    if (!preview) {
      const view = await this.reader.read(lessonId, actor);
      if (version !== undefined && version !== view.version || !collectFileIds(view).has(file.id)) throw new NotFoundException('Longread file not found');
    }
    if (file.status !== 'active' || file.scanStatus !== 'available' || !file.objectKey) throw new NotFoundException('Longread file not found');
    const configuredTtl = Number(process.env['S3_PRESIGNED_TTL_SECONDS'] ?? 300);
    const expiresIn = Number.isFinite(configuredTtl) ? Math.min(300, Math.max(1, Math.floor(configuredTtl))) : 300;
    const url = isLongreadImage(file.mimeType ?? '') ? await this.storage.getInlinePresignedUrl(file.objectKey, file.mimeType!, expiresIn) : await this.storage.getPresignedUrl(file.objectKey, file.fileName!, expiresIn);
    return { url, expiresIn, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes };
  }
}
