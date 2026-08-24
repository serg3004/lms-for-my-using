import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { UploadService } from '../upload/upload.service.js';
import { CourseMaterialsService } from './course-materials.service.js';
import { MaterialMalwareScanService } from './material-malware-scan.service.js';
import {
  MaterialMultipartUploadService,
  MULTIPART_CLEANUP_BATCH_SIZE,
  MULTIPART_CLEANUP_CONCURRENCY,
  MULTIPART_PART_SIZE_BYTES,
} from './material-multipart-upload.service.js';

const session = {
  id: 'session-a', uploadId: 'upload-a', organizationId: 'organization-a', materialId: 'material-a',
  objectKey: 'quarantine/organizations/organization-a/materials/material-a/key', fileName: 'video.mp4',
  mimeType: 'video/mp4', sizeBytes: 10, partSizeBytes: MULTIPART_PART_SIZE_BYTES, status: 'pending' as const,
  expiresAt: new Date(Date.now() + 60_000), completedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

function setup(found: typeof session | { status: 'completed' } | null = session) {
  const prisma = {
    multipartUpload: {
      create: jest.fn(async () => session),
      findFirst: jest.fn(async () => found),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => session),
    },
  } as unknown as PrismaService;
  const storage = {
    createQuarantineObjectKey: jest.fn(() => session.objectKey),
    createMultipartUpload: jest.fn(async () => session.uploadId),
    getMultipartPartUrl: jest.fn(async (_key, _id, part) => `https://storage.test/part/${part}`),
    completeMultipartUpload: jest.fn(async () => session.sizeBytes),
    abortMultipartUpload: jest.fn(async () => undefined),
    deleteObject: jest.fn(async () => undefined),
  } as unknown as UploadService;
  const materials = {
    getMaterialStorageReference: jest.fn(async () => ({ id: session.materialId })),
    getCourseMaterial: jest.fn(async () => ({ id: session.materialId })),
    attachUploadedFile: jest.fn(async () => ({ id: session.materialId })),
  } as unknown as CourseMaterialsService;
  const scans = { dispatch: jest.fn(async () => undefined) } as unknown as MaterialMalwareScanService;
  return { service: new MaterialMultipartUploadService(prisma, storage, materials, scans), prisma, storage, materials, scans };
}

describe('MaterialMultipartUploadService', () => {
  it('creates a tenant-scoped upload and presigns every part', async () => {
    const { service, storage, prisma } = setup();
    const result = await service.initiate('material-a', 'organization-a', {
      fileName: 'video.mp4', mimeType: 'video/mp4', sizeBytes: MULTIPART_PART_SIZE_BYTES + 1,
    });
    expect(result.parts).toHaveLength(2);
    expect(storage.createQuarantineObjectKey).toHaveBeenCalledWith('organization-a', 'material-a');
    expect(prisma.multipartUpload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'organization-a' }) }));
  });

  it('does not reveal or complete another tenant upload', async () => {
    const { service, storage } = setup(null);
    await expect(service.complete('material-a', 'organization-attacker', 'upload-a', { parts: [{ partNumber: 1, etag: 'etag' }] })).rejects.toThrow(NotFoundException);
    expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it('rejects missing or unordered parts before contacting S3', async () => {
    const { service, storage } = setup();
    await expect(service.complete('material-a', 'organization-a', 'upload-a', { parts: [{ partNumber: 2, etag: 'etag' }] })).rejects.toThrow(BadRequestException);
    expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it('returns the material without repeating S3 completion when already completed', async () => {
    const { service, storage, materials } = setup({ ...session, status: 'completed' });
    await expect(service.complete('material-a', 'organization-a', 'upload-a', { parts: [{ partNumber: 1, etag: 'etag' }] })).resolves.toEqual({ id: 'material-a' });
    expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
    expect(materials.getCourseMaterial).toHaveBeenCalled();
  });

  it('completes, attaches, and dispatches scanning once', async () => {
    const { service, prisma, materials, scans } = setup();
    await service.complete('material-a', 'organization-a', 'upload-a', { parts: [{ partNumber: 1, etag: 'etag' }] });
    expect(materials.attachUploadedFile).toHaveBeenCalledWith('material-a', 'organization-a', expect.objectContaining({ objectKey: session.objectKey }));
    expect(prisma.multipartUpload.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }));
    expect(scans.dispatch).toHaveBeenCalledWith('material-a');
  });

  it('aborts expired sessions only in execute mode', async () => {
    const { service, prisma, storage } = setup();
    (prisma.multipartUpload.findMany as jest.Mock).mockResolvedValue([session]);
    await expect(service.cleanupExpired(true)).resolves.toMatchObject({ dryRun: true, count: 1 });
    expect(storage.abortMultipartUpload).not.toHaveBeenCalled();

    await expect(service.cleanupExpired(false)).resolves.toMatchObject({ dryRun: false, count: 1 });
    expect(storage.abortMultipartUpload).toHaveBeenCalledWith(session.objectKey, session.uploadId);
    expect(prisma.multipartUpload.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'aborted' } }));
  });

  it('reads a large expired set in deterministic bounded batches', async () => {
    const { service, prisma } = setup();
    const expired = Array.from({ length: MULTIPART_CLEANUP_BATCH_SIZE * 2 + 5 }, (_, index) => ({
      ...session,
      id: `session-${index.toString().padStart(3, '0')}`,
      uploadId: `upload-${index}`,
    }));
    (prisma.multipartUpload.findMany as jest.Mock)
      .mockResolvedValueOnce(expired.slice(0, MULTIPART_CLEANUP_BATCH_SIZE))
      .mockResolvedValueOnce(expired.slice(MULTIPART_CLEANUP_BATCH_SIZE, MULTIPART_CLEANUP_BATCH_SIZE * 2))
      .mockResolvedValueOnce(expired.slice(MULTIPART_CLEANUP_BATCH_SIZE * 2));

    await expect(service.cleanupExpired(true)).resolves.toEqual({ dryRun: true, count: expired.length, failedCount: 0 });
    expect(prisma.multipartUpload.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.multipartUpload.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      take: MULTIPART_CLEANUP_BATCH_SIZE,
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    }));
    expect(prisma.multipartUpload.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cursor: { id: expired[MULTIPART_CLEANUP_BATCH_SIZE - 1]?.id },
      skip: 1,
      take: MULTIPART_CLEANUP_BATCH_SIZE,
    }));
  });

  it('limits abort concurrency and continues after individual failures', async () => {
    const { service, prisma, storage } = setup();
    const expired = Array.from({ length: MULTIPART_CLEANUP_CONCURRENCY + 2 }, (_, index) => ({
      ...session, id: `session-${index}`, uploadId: `upload-${index}`,
    }));
    (prisma.multipartUpload.findMany as jest.Mock).mockResolvedValueOnce(expired);
    let active = 0;
    let peak = 0;
    (storage.abortMultipartUpload as jest.Mock).mockImplementation(async (_key, uploadId) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      if (uploadId === 'upload-2') throw new Error('provider failure');
    });

    await expect(service.cleanupExpired(false)).resolves.toEqual({ dryRun: false, count: expired.length, failedCount: 1 });
    expect(peak).toBe(MULTIPART_CLEANUP_CONCURRENCY);
    expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(expired.length);
    expect(prisma.multipartUpload.update).toHaveBeenCalledTimes(expired.length - 1);
    expect(prisma.multipartUpload.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'session-2' } }));
  });

  it('safely retries a session left pending by an earlier failed cleanup', async () => {
    const { service, prisma, storage } = setup();
    const retrySession = { ...session, id: 'session-retry', uploadId: 'upload-retry' };
    (prisma.multipartUpload.findMany as jest.Mock)
      .mockResolvedValueOnce([retrySession])
      .mockResolvedValueOnce([retrySession]);
    (storage.abortMultipartUpload as jest.Mock)
      .mockRejectedValueOnce(new Error('temporary provider failure'))
      .mockResolvedValueOnce(undefined);

    await expect(service.cleanupExpired(false)).resolves.toMatchObject({ count: 1, failedCount: 1 });
    await expect(service.cleanupExpired(false)).resolves.toMatchObject({ count: 1, failedCount: 0 });
    expect(prisma.multipartUpload.update).toHaveBeenCalledTimes(1);
    expect(prisma.multipartUpload.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: retrySession.id } }));
  });
});
