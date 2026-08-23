import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { UploadService } from '../upload/public.js';
import { ChecklistsService } from './checklists.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const instanceId = '22222222-2222-2222-2222-222222222222';
const itemId = '33333333-3333-3333-3333-333333333333';
const learnerId = '44444444-4444-4444-4444-444444444444';

function createService({ instance, result }: { instance: { userId: string } | null; result: { photoObjectKey: string | null; photoMimeType: string | null } | null }) {
  const prisma = {
    checklistInstance: { findFirst: jest.fn(async () => instance) },
    checklistItemResult: { findUnique: jest.fn(async () => result) },
  } as unknown as PrismaService;
  const upload = {
    getInlinePresignedUrl: jest.fn(async () => 'https://storage.example.test/temporary-photo'),
  } as unknown as UploadService;
  return { prisma, upload, service: new ChecklistsService(prisma, upload) };
}

describe('ChecklistsService checklist photo download', () => {
  it('returns a temporary URL for object-backed evidence to a privileged reviewer', async () => {
    const { service, upload } = createService({
      instance: { userId: learnerId },
      result: { photoObjectKey: 'checklists/evidence.jpg', photoMimeType: 'image/jpeg' },
    });

    await expect(service.getItemPhotoDownload(instanceId, itemId, organizationId, 'reviewer-id', true)).resolves.toEqual({
      url: 'https://storage.example.test/temporary-photo',
      expiresIn: 300,
    });
    expect(upload.getInlinePresignedUrl).toHaveBeenCalledWith('checklists/evidence.jpg', 'image/jpeg', 300);
  });

  it('returns not found when the instance is outside the caller organization', async () => {
    const { service, prisma } = createService({ instance: null, result: null });

    await expect(service.getItemPhotoDownload(instanceId, itemId, organizationId, 'reviewer-id', true)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.checklistInstance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: instanceId, organizationId, deletedAt: null },
    }));
  });

  it('returns not found when no object-backed evidence exists', async () => {
    const { service } = createService({
      instance: { userId: learnerId },
      result: { photoObjectKey: null, photoMimeType: null },
    });

    await expect(service.getItemPhotoDownload(instanceId, itemId, organizationId, 'reviewer-id', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('preserves learner ownership protection', async () => {
    const { service } = createService({
      instance: { userId: learnerId },
      result: { photoObjectKey: 'checklists/evidence.jpg', photoMimeType: 'image/jpeg' },
    });

    await expect(service.getItemPhotoDownload(instanceId, itemId, organizationId, 'different-learner', false)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
