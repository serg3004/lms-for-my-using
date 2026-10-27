import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import type { AuthenticatedRequest } from '../auth/public.js';
import { ChecklistsController } from './checklists.controller.js';
import type { ChecklistsService } from './checklists.service.js';
import type { UploadService } from '../upload/public.js';

const request = { currentUser: { id: 'u1', organizationId: 'org', roles: ['admin'] } } as unknown as AuthenticatedRequest;

function makeController(checklistsService: Partial<ChecklistsService>, uploadService: Partial<UploadService>) {
  return new ChecklistsController(checklistsService as ChecklistsService, uploadService as UploadService, {} as never, {} as never, {} as never, {} as never);
}

function image(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'cover.png',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
    size: 10,
    ...overrides,
  } as Express.Multer.File;
}

// PR 355: the cover upload accepts only real images, checks the content signature and not just
// the declared type or extension, and removes the stored object when saving it fails.
describe('ChecklistsController.uploadCover', () => {
  it('rejects a missing file and a non-image type before storage is touched', async () => {
    const upload = jest.fn();
    const controller = makeController({}, { uploadChecklistCover: upload as never });
    await expect(controller.uploadCover('c1', undefined, request)).rejects.toThrow(BadRequestException);
    await expect(
      controller.uploadCover('c1', image({ mimetype: 'application/pdf', buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]) }), request),
    ).rejects.toThrow(BadRequestException);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects a spoofed file: PNG type and extension over JPEG bytes', async () => {
    const upload = jest.fn();
    const controller = makeController({}, { uploadChecklistCover: upload as never });
    const spoofed = image({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]) });
    await expect(controller.uploadCover('c1', spoofed, request)).rejects.toThrow(BadRequestException);
    expect(upload).not.toHaveBeenCalled();
  });

  it('stores a valid image for the caller organization and returns the saved cover timestamp', async () => {
    const uploaded = { objectKey: 'organizations/org/checklist-covers/c1/x', fileName: 'cover.png', mimeType: 'image/png', sizeBytes: 10 };
    const upload = jest.fn(async () => uploaded);
    const replace = jest.fn(async () => ({ id: 'c1', coverUpdatedAt: new Date() }));
    const controller = makeController({ replaceCover: replace as never }, { uploadChecklistCover: upload as never });
    await expect(controller.uploadCover('c1', image(), request)).resolves.toMatchObject({ id: 'c1' });
    expect(upload).toHaveBeenCalledWith(expect.anything(), 'org', 'c1');
    expect(replace).toHaveBeenCalledWith('c1', 'org', 'u1', uploaded);
  });

  it('deletes the stored object when the checklist cannot be updated', async () => {
    const uploaded = { objectKey: 'k', fileName: 'cover.png', mimeType: 'image/png', sizeBytes: 10 };
    const deleteObject = jest.fn(async () => undefined);
    const controller = makeController(
      { replaceCover: (async () => { throw new Error('not found'); }) as never },
      { uploadChecklistCover: (async () => uploaded) as never, deleteObject: deleteObject as never },
    );
    await expect(controller.uploadCover('c1', image(), request)).rejects.toThrow('not found');
    expect(deleteObject).toHaveBeenCalledWith('k');
  });
});
