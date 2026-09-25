import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import type { AuthenticatedRequest } from '../auth/public.js';
import { ChecklistsController } from './checklists.controller.js';
import type { ChecklistReviewAccessService } from './checklist-review-access.service.js';
import type { ChecklistWorkplaceSettingsService } from './checklist-workplace-settings.service.js';
import type { ChecklistsService } from './checklists.service.js';
import type { UploadService } from '../upload/public.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const instanceId = '22222222-2222-2222-2222-222222222222';
const itemId = '33333333-3333-3333-3333-333333333333';
const learnerId = '44444444-4444-4444-4444-444444444444';

function makeRequest(userId: string, roles: string[]): AuthenticatedRequest {
  return { currentUser: { id: userId, organizationId, roles } } as unknown as AuthenticatedRequest;
}

function makeController(overrides: {
  checklistsService?: Partial<ChecklistsService>;
  reviewAccess?: Partial<ChecklistReviewAccessService>;
  uploadService?: Partial<UploadService>;
} = {}) {
  const checklistsService = overrides.checklistsService ?? {};
  const reviewAccess = overrides.reviewAccess ?? { assertReviewerCanAccess: jest.fn(async () => undefined) };
  const uploadService = overrides.uploadService ?? {};
  const workplaceSettings = {};

  return new ChecklistsController(
    checklistsService as ChecklistsService,
    uploadService as UploadService,
    reviewAccess as ChecklistReviewAccessService,
    workplaceSettings as ChecklistWorkplaceSettingsService,
  );
}

// A minimal but real JPEG magic-byte buffer (0xFF 0xD8 0xFF) -- upload.validation.ts's
// matchesDeclaredMimeType checks these bytes, so an arbitrary buffer would fail validation before
// the scenario under test (storage failure, attach failure) is even reached.
function jpegFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'evidence.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    size: 10,
    ...overrides,
  } as Express.Multer.File;
}

/**
 * PR 306 anomalies #6 (photo rejected) and #7 (storage failure): checklist item photo upload had
 * zero dedicated test coverage anywhere in the module -- `checklists.photo-review.spec.ts` only
 * covers the download side. These prove the controller's actual rejection/failure/cleanup paths,
 * not just that they exist by reading the source.
 */
describe('ChecklistsController.uploadItemPhoto', () => {
  it('#6: rejects a disallowed file type before ever calling the upload service (photo rejected)', async () => {
    const upload = jest.fn();
    const controller = makeController({ uploadService: { uploadChecklistItemPhoto: upload as never } });
    const file = jpegFile({ mimetype: 'application/pdf', buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]) });

    await expect(controller.uploadItemPhoto(instanceId, itemId, file, makeRequest(learnerId, ['learner']))).rejects.toThrow(
      BadRequestException,
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('#6: rejects a request with no file attached, before touching review access or the upload service', async () => {
    const assertReviewerCanAccess = jest.fn(async () => undefined);
    const upload = jest.fn();
    const controller = makeController({
      reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as never },
      uploadService: { uploadChecklistItemPhoto: upload as never },
    });

    await expect(
      controller.uploadItemPhoto(instanceId, itemId, undefined, makeRequest(learnerId, ['learner'])),
    ).rejects.toThrow(BadRequestException);
    expect(assertReviewerCanAccess).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('#7: propagates a storage-layer failure from the upload service instead of swallowing it', async () => {
    const upload = jest.fn(async () => {
      throw new Error('S3: connection reset');
    });
    const assertInstanceWritable = jest.fn(async () => undefined);
    const controller = makeController({
      checklistsService: { assertInstanceWritable: assertInstanceWritable as never },
      uploadService: { uploadChecklistItemPhoto: upload as never },
    });

    await expect(
      controller.uploadItemPhoto(instanceId, itemId, jpegFile(), makeRequest(learnerId, ['learner'])),
    ).rejects.toThrow('S3: connection reset');
    expect(assertInstanceWritable).toHaveBeenCalled();
  });

  it('#7: deletes the just-uploaded object when attaching it to the item afterwards fails, instead of leaving an orphaned file', async () => {
    const uploaded = { objectKey: 'checklists/instance/item/photo.jpg', url: 'https://example.test/photo.jpg' };
    const upload = jest.fn(async () => uploaded);
    const deleteObject = jest.fn(async () => undefined);
    const attachItemPhoto = jest.fn(async () => {
      throw new Error('attach failed: item not found');
    });
    const assertInstanceWritable = jest.fn(async () => undefined);
    const controller = makeController({
      checklistsService: { assertInstanceWritable: assertInstanceWritable as never, attachItemPhoto: attachItemPhoto as never },
      uploadService: { uploadChecklistItemPhoto: upload as never, deleteObject: deleteObject as never },
    });

    await expect(
      controller.uploadItemPhoto(instanceId, itemId, jpegFile(), makeRequest(learnerId, ['learner'])),
    ).rejects.toThrow('attach failed: item not found');
    expect(deleteObject).toHaveBeenCalledWith(uploaded.objectKey);
  });

  it('#7: still surfaces the original attach failure even if the storage cleanup itself also fails', async () => {
    const uploaded = { objectKey: 'checklists/instance/item/photo.jpg', url: 'https://example.test/photo.jpg' };
    const upload = jest.fn(async () => uploaded);
    const deleteObject = jest.fn(async () => {
      throw new Error('S3: cleanup connection reset');
    });
    const attachItemPhoto = jest.fn(async () => {
      throw new Error('attach failed: item not found');
    });
    const controller = makeController({
      checklistsService: { assertInstanceWritable: jest.fn(async () => undefined) as never, attachItemPhoto: attachItemPhoto as never },
      uploadService: { uploadChecklistItemPhoto: upload as never, deleteObject: deleteObject as never },
    });

    await expect(
      controller.uploadItemPhoto(instanceId, itemId, jpegFile(), makeRequest(learnerId, ['learner'])),
    ).rejects.toThrow('attach failed: item not found');
    expect(deleteObject).toHaveBeenCalled();
  });

  it('succeeds and returns the attached photo when both upload and attach succeed', async () => {
    const uploaded = { objectKey: 'checklists/instance/item/photo.jpg', url: 'https://example.test/photo.jpg' };
    const attached = { id: itemId, photoUrl: uploaded.url };
    const controller = makeController({
      checklistsService: {
        assertInstanceWritable: jest.fn(async () => undefined) as never,
        attachItemPhoto: jest.fn(async () => attached) as never,
      },
      uploadService: { uploadChecklistItemPhoto: jest.fn(async () => uploaded) as never },
    });

    const result = await controller.uploadItemPhoto(instanceId, itemId, jpegFile(), makeRequest(learnerId, ['learner']));

    expect(result).toEqual(attached);
  });
});
