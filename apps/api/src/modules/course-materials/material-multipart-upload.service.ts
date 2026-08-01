import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { UploadService } from '../upload/upload.service.js';
import { validateUploadMetadata } from '../upload/upload.validation.js';
import { CourseMaterialsService } from './course-materials.service.js';
import { MaterialMalwareScanService } from './material-malware-scan.service.js';
import type { CompleteMultipartUploadInput, InitiateMultipartUploadInput } from './multipart-upload.schemas.js';

export const MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;
const UPLOAD_TTL_MS = 24 * 60 * 60_000;

@Injectable()
export class MaterialMultipartUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: UploadService,
    private readonly materials: CourseMaterialsService,
    private readonly malwareScans: MaterialMalwareScanService,
  ) {}

  async initiate(materialId: string, organizationId: string, input: InitiateMultipartUploadInput) {
    validateUploadMetadata(input.fileName, input.mimeType, input.sizeBytes);
    await this.materials.getMaterialStorageReference(materialId, organizationId);

    const objectKey = this.storage.createQuarantineObjectKey(organizationId, materialId);
    const uploadId = await this.storage.createMultipartUpload(objectKey, input.mimeType);
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS);
    try {
      await this.prisma.multipartUpload.create({ data: {
        uploadId, organizationId, materialId, objectKey,
        fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes,
        partSizeBytes: MULTIPART_PART_SIZE_BYTES, expiresAt,
      } });
    } catch (error) {
      await this.storage.abortMultipartUpload(objectKey, uploadId).catch(() => undefined);
      throw error;
    }

    const partCount = Math.ceil(input.sizeBytes / MULTIPART_PART_SIZE_BYTES);
    const parts = await Promise.all(Array.from({ length: partCount }, async (_, index) => ({
      partNumber: index + 1,
      url: await this.storage.getMultipartPartUrl(objectKey, uploadId, index + 1),
    })));
    return { uploadId, partSizeBytes: MULTIPART_PART_SIZE_BYTES, expiresAt, parts };
  }

  async complete(materialId: string, organizationId: string, uploadId: string, input: CompleteMultipartUploadInput) {
    const session = await this.findOwned(uploadId, materialId, organizationId);
    if (session.status === 'completed') {
      return this.materials.getCourseMaterial(materialId, organizationId);
    }
    if (session.status !== 'pending' || session.expiresAt <= new Date()) {
      throw new BadRequestException('Multipart upload is no longer active');
    }

    const expectedParts = Math.ceil(session.sizeBytes / session.partSizeBytes);
    if (input.parts.length !== expectedParts || input.parts.some((part, index) => part.partNumber !== index + 1)) {
      throw new BadRequestException('Multipart upload parts must be complete and ordered');
    }
    const actualSize = await this.storage.completeMultipartUpload(session.objectKey, uploadId, input.parts);
    if (actualSize !== session.sizeBytes) {
      await this.storage.deleteObject(session.objectKey);
      await this.prisma.multipartUpload.update({ where: { id: session.id }, data: { status: 'aborted' } });
      throw new BadRequestException('Uploaded object size does not match the declared size');
    }

    const material = await this.materials.attachUploadedFile(materialId, organizationId, {
      objectKey: session.objectKey,
      fileName: session.fileName,
      mimeType: session.mimeType,
      sizeBytes: session.sizeBytes,
    });
    await this.prisma.multipartUpload.update({ where: { id: session.id }, data: { status: 'completed', completedAt: new Date() } });
    await this.malwareScans.dispatch(materialId);
    return material;
  }

  async abort(materialId: string, organizationId: string, uploadId: string) {
    const session = await this.findOwned(uploadId, materialId, organizationId);
    if (session.status === 'aborted') return { aborted: true };
    if (session.status === 'completed') throw new BadRequestException('Completed upload cannot be aborted');
    await this.storage.abortMultipartUpload(session.objectKey, uploadId);
    await this.prisma.multipartUpload.update({ where: { id: session.id }, data: { status: 'aborted' } });
    return { aborted: true };
  }

  async cleanupExpired(dryRun = true, now = new Date()) {
    const sessions = await this.prisma.multipartUpload.findMany({ where: { status: 'pending', expiresAt: { lte: now } } });
    if (!dryRun) {
      for (const session of sessions) {
        await this.storage.abortMultipartUpload(session.objectKey, session.uploadId);
        await this.prisma.multipartUpload.update({ where: { id: session.id }, data: { status: 'aborted' } });
      }
    }
    return { dryRun, count: sessions.length, uploadIds: sessions.map((session) => session.uploadId) };
  }

  private async findOwned(uploadId: string, materialId: string, organizationId: string) {
    const session = await this.prisma.multipartUpload.findFirst({ where: { uploadId, materialId, organizationId } });
    if (!session) throw new NotFoundException('Multipart upload not found');
    return session;
  }
}
