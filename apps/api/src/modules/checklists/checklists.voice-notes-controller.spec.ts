import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
const noteId = '88888888-8888-8888-8888-888888888888';
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
  const reviewAccess = { isAssignedObserver: jest.fn(async () => false), assertReviewerCanAccess: jest.fn(async () => undefined), ...overrides.reviewAccess };
  const uploadService = overrides.uploadService ?? {};
  const workplaceSettings = {};

  return new ChecklistsController(
    checklistsService as ChecklistsService,
    uploadService as UploadService,
    reviewAccess as ChecklistReviewAccessService,
    workplaceSettings as ChecklistWorkplaceSettingsService,
  );
}

function webmFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  const buffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03]);
  return { fieldname: 'file', originalname: 'voice.webm', encoding: '7bit', mimetype: 'audio/webm;codecs=opus', buffer, size: buffer.length, ...overrides } as Express.Multer.File;
}
const fields = { durationMs: '4200' };

/** PR 509: voice recordings of the comment of an answer, upload and access rules at the controller. */
describe('ChecklistsController voice recordings', () => {
  it('rejects a missing file, a wrong type, a wrong length and a wrong id before any storage call', async () => {
    const upload = jest.fn();
    const controller = makeController({ uploadService: { uploadChecklistVoiceNote: upload as never } });
    const request = makeRequest(learnerId, ['learner']);
    await expect(controller.uploadVoiceNote(instanceId, itemId, undefined, fields, request)).rejects.toThrow(BadRequestException);
    await expect(controller.uploadVoiceNote(instanceId, itemId, webmFile({ mimetype: 'audio/mpeg' }), fields, request)).rejects.toThrow(BadRequestException);
    await expect(controller.uploadVoiceNote(instanceId, itemId, webmFile({ buffer: Buffer.from('not audio at all'), size: 16 }), fields, request)).rejects.toThrow('does not match');
    await expect(controller.uploadVoiceNote(instanceId, itemId, webmFile(), { durationMs: '125000' }, request)).rejects.toThrow();
    await expect(controller.uploadVoiceNote(instanceId, itemId, webmFile(), {}, request)).rejects.toThrow();
    expect(upload).not.toHaveBeenCalled();
  });

  it('checks the room first, stores the plain type and saves the row with the author’s rights', async () => {
    const uploaded = { objectKey: 'organizations/o/checklist-voice/i/k', fileName: 'voice', mimeType: 'audio/webm', sizeBytes: 7 };
    const upload = jest.fn(async () => uploaded);
    const assertVoiceNoteRoom = jest.fn(async () => undefined);
    const addVoiceNote = jest.fn(async () => ({ id: 'note' }));
    const controller = makeController({
      checklistsService: { assertVoiceNoteRoom: assertVoiceNoteRoom as never, addVoiceNote: addVoiceNote as never },
      uploadService: { uploadChecklistVoiceNote: upload as never },
    });
    await expect(controller.uploadVoiceNote(instanceId, itemId, webmFile(), fields, makeRequest(learnerId, ['learner']))).resolves.toEqual({ id: 'note' });
    expect(assertVoiceNoteRoom).toHaveBeenCalledWith(instanceId, itemId, organizationId, learnerId, false, undefined);
    expect(upload).toHaveBeenCalledWith(expect.anything(), 'audio/webm', organizationId, instanceId);
    expect(addVoiceNote).toHaveBeenCalledWith(instanceId, itemId, organizationId, learnerId, false, uploaded, 4200, undefined);
  });

  it('does not store anything when there is no room or the check is closed', async () => {
    const upload = jest.fn();
    const controller = makeController({
      checklistsService: { assertVoiceNoteRoom: jest.fn(async () => { throw new BadRequestException('This checklist assignment is no longer editable'); }) as never },
      uploadService: { uploadChecklistVoiceNote: upload as never },
    });
    await expect(controller.uploadVoiceNote(instanceId, itemId, webmFile(), fields, makeRequest(learnerId, ['learner']))).rejects.toThrow('no longer editable');
    expect(upload).not.toHaveBeenCalled();
  });

  it('deletes the just-stored object when the row cannot be saved', async () => {
    const deleteObject = jest.fn(async () => undefined);
    const controller = makeController({
      checklistsService: { assertVoiceNoteRoom: jest.fn(async () => undefined) as never, addVoiceNote: jest.fn(async () => { throw new Error('db down'); }) as never },
      uploadService: { uploadChecklistVoiceNote: jest.fn(async () => ({ objectKey: 'k', fileName: 'voice', mimeType: 'audio/webm', sizeBytes: 7 })) as never, deleteObject: deleteObject as never },
    });
    await expect(controller.uploadVoiceNote(instanceId, itemId, webmFile(), fields, makeRequest(learnerId, ['learner']))).rejects.toThrow('db down');
    expect(deleteObject).toHaveBeenCalledWith('k');
  });

  it('hides the check from a role that cannot fill it, and asks reviewer access for a privileged role', async () => {
    const assertReviewerCanAccess = jest.fn(async () => undefined);
    const controller = makeController({
      reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as never },
      checklistsService: { removeVoiceNote: jest.fn(async () => undefined) as never },
    });
    await expect(controller.removeVoiceNote(instanceId, noteId, makeRequest(learnerId, ['mentor']))).rejects.toThrow(NotFoundException);
    await controller.removeVoiceNote(instanceId, noteId, makeRequest(learnerId, ['manager']));
    expect(assertReviewerCanAccess).toHaveBeenCalledTimes(1);
  });

  it('serves the file through the API with a private, validated, non-sniffable response', async () => {
    const getVoiceNoteFile = jest.fn(async () => ({ bytes: Buffer.from('abc'), mimeType: 'audio/webm', version: 9 }));
    const controller = makeController({ checklistsService: { getVoiceNoteFile: getVoiceNoteFile as never } });
    const sent: { headers?: Record<string, string>; status?: number; body?: Buffer } = {};
    const response = { set: (headers: Record<string, string>) => { sent.headers = headers; return response; }, status: (code: number) => { sent.status = code; return response; }, send: (body?: Buffer) => { sent.body = body; return response; } };
    await controller.getVoiceNoteFile(instanceId, noteId, undefined, makeRequest(learnerId, ['learner']), response as never);
    expect(getVoiceNoteFile).toHaveBeenCalledWith(instanceId, noteId, organizationId, learnerId, false);
    expect(sent.headers).toMatchObject({ 'Content-Type': 'audio/webm', 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff', ETag: '"9"' });
    expect(sent.body).toEqual(Buffer.from('abc'));
    await controller.getVoiceNoteFile(instanceId, noteId, '"9"', makeRequest(learnerId, ['learner']), response as never);
    expect(sent.status).toBe(304);
  });

  it('keeps the check closed to another employee (the service refuses)', async () => {
    const controller = makeController({ checklistsService: { getVoiceNoteFile: jest.fn(async () => { throw new ForbiddenException('You can only view your own checklist assignment'); }) as never } });
    await expect(controller.getVoiceNoteFile(instanceId, noteId, undefined, makeRequest('77777777-7777-7777-7777-777777777777', ['learner']), {} as never)).rejects.toThrow(ForbiddenException);
  });
});
