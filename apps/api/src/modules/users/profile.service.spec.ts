import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import type { PrismaService } from '../../database/prisma.service.js';
import { unrestrictedActor } from '../manager-team-scope/public.js';
import type { UploadService } from '../upload/public.js';
import { ProfileService } from './profile.service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const row = { phone: null, locale: 'ru', timezone: 'Asia/Almaty', aboutMe: null, photoMimeType: null, profileVersion: 3 };

function harness(current: typeof row | null = row, updated = 1) {
  const audit = { record: jest.fn(async () => undefined) };
  const prisma = {
    user: {
      findFirst: jest.fn(async () => current),
      updateMany: jest.fn(async () => ({ count: updated })),
      update: jest.fn(async () => ({})),
    },
  };
  const upload = { uploadUserPhoto: jest.fn(async () => 'key-1'), deleteObject: jest.fn(async () => undefined), getObjectBytes: jest.fn(async () => Buffer.from('img')) };
  return { prisma, audit, upload, service: new ProfileService(prisma as unknown as PrismaService, upload as unknown as UploadService, audit as never) };
}

describe('ProfileService (PR 496)', () => {
  it('saves only the changed fields, bumps the version and audits field names without values', async () => {
    const { service, prisma, audit } = harness();
    await service.updateOwnProfile(userId, organizationId, { version: 3, phone: '+77011234567', aboutMe: 'Привет', locale: 'ru' });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: userId, organizationId, profileVersion: 3 },
      data: { phone: '+77011234567', aboutMe: 'Привет', profileVersion: { increment: 1 } },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.profile_updated', actorId: userId, metadata: { fields: ['phone', 'aboutMe'] } }));
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('+77011234567');
  });

  it('writes nothing when nothing changed', async () => {
    const { service, prisma, audit } = harness();
    await service.updateOwnProfile(userId, organizationId, { version: 3, locale: 'ru', phone: '' });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('answers 409 for an outdated version, also when a simultaneous save won the race', async () => {
    await expect(harness().service.updateOwnProfile(userId, organizationId, { version: 2, phone: '+77011234567' })).rejects.toThrow(ConflictException);
    await expect(harness(row, 0).service.updateOwnProfile(userId, organizationId, { version: 3, phone: '+77011234567' })).rejects.toThrow(ConflictException);
    await expect(harness(null).service.updateOwnProfile(userId, organizationId, { version: 3 })).rejects.toThrow(NotFoundException);
  });

  it('refuses a photo of the wrong type or size', async () => {
    const { service, upload } = harness();
    const file = (mimetype: string, size: number) => ({ mimetype, size, originalname: 'me.png', buffer: Buffer.alloc(0) }) as Express.Multer.File;
    await expect(service.setOwnPhoto(userId, organizationId, file('image/gif', 10))).rejects.toThrow(BadRequestException);
    await expect(service.setOwnPhoto(userId, organizationId, file('image/png', 1_048_577))).rejects.toThrow(BadRequestException);
    expect(upload.uploadUserPhoto).not.toHaveBeenCalled();
  });

  it('hides the photo from people who may not read the user', async () => {
    const { service } = harness();
    await expect(service.getPhotoFile(userId, { id: '33333333-3333-4333-8333-333333333333', organizationId, roles: ['learner'] })).rejects.toThrow(NotFoundException);
    await expect(service.getPhotoFile(userId, { ...unrestrictedActor(organizationId), id: '33333333-3333-4333-8333-333333333333' })).rejects.toThrow(NotFoundException); // no photo set
  });
});
