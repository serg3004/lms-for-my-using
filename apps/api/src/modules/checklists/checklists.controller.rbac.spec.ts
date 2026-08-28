import { ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';

import type { AuthenticatedRequest } from '../auth/public.js';
import { ChecklistsController } from './checklists.controller.js';
import type { ChecklistReviewAccessService } from './checklist-review-access.service.js';
import type { ChecklistsService } from './checklists.service.js';
import type { UploadService } from '../upload/public.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const instanceId = '22222222-2222-2222-2222-222222222222';
const itemId = '33333333-3333-3333-3333-333333333333';
const learnerId = '44444444-4444-4444-4444-444444444444';
const otherLearnerId = '55555555-5555-5555-5555-555555555555';
const reviewerId = '66666666-6666-6666-6666-666666666666';

function makeRequest(userId: string, roles: string[]): AuthenticatedRequest {
  return { currentUser: { id: userId, organizationId, roles } } as unknown as AuthenticatedRequest;
}

function makeController(overrides: {
  checklistsService?: Partial<ChecklistsService>;
  reviewAccess?: Partial<ChecklistReviewAccessService>;
  uploadService?: Partial<UploadService>;
} = {}) {
  const checklistsService = overrides.checklistsService ?? {};
  const reviewAccess = overrides.reviewAccess ?? {};
  const uploadService = overrides.uploadService ?? {};

  return new ChecklistsController(
    checklistsService as ChecklistsService,
    uploadService as UploadService,
    reviewAccess as ChecklistReviewAccessService,
  );
}

describe('ChecklistsController — inline learner-ownership enforcement (RBAC)', () => {
  describe('getInstance', () => {
    it('rejects a learner reading another learner\'s checklist instance', async () => {
      const getInstance = jest.fn(async () => ({ userId: otherLearnerId }));
      const assertReviewerCanAccess = jest.fn(async () => undefined);
      const controller = makeController({
        checklistsService: { getInstance: getInstance as unknown as ChecklistsService['getInstance'] },
        reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as unknown as ChecklistReviewAccessService['assertReviewerCanAccess'] },
      });

      await expect(controller.getInstance(instanceId, makeRequest(learnerId, ['learner']))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(assertReviewerCanAccess).not.toHaveBeenCalled();
    });

    it('allows a learner to read their own checklist instance without a reviewer-access check', async () => {
      const getInstance = jest.fn(async () => ({ userId: learnerId }));
      const assertReviewerCanAccess = jest.fn(async () => undefined);
      const controller = makeController({
        checklistsService: { getInstance: getInstance as unknown as ChecklistsService['getInstance'] },
        reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as unknown as ChecklistReviewAccessService['assertReviewerCanAccess'] },
      });

      await expect(controller.getInstance(instanceId, makeRequest(learnerId, ['learner']))).resolves.toEqual({
        userId: learnerId,
      });
      expect(assertReviewerCanAccess).not.toHaveBeenCalled();
    });

    it('requires reviewer-access approval for a privileged role, regardless of instance ownership', async () => {
      const getInstance = jest.fn(async () => ({ userId: otherLearnerId }));
      const assertReviewerCanAccess = jest.fn(async () => {
        throw new ForbiddenException();
      });
      const controller = makeController({
        checklistsService: { getInstance: getInstance as unknown as ChecklistsService['getInstance'] },
        reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as unknown as ChecklistReviewAccessService['assertReviewerCanAccess'] },
      });

      await expect(
        controller.getInstance(instanceId, makeRequest(reviewerId, ['manager'])),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(assertReviewerCanAccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: reviewerId, roles: ['manager'] }),
        instanceId,
      );
    });
  });

  describe('listEvents', () => {
    it('rejects a learner reading the event timeline of another learner\'s instance', async () => {
      const getInstance = jest.fn(async () => ({ userId: otherLearnerId }));
      const listEvents = jest.fn();
      const controller = makeController({
        checklistsService: {
          getInstance: getInstance as unknown as ChecklistsService['getInstance'],
          listEvents: listEvents as unknown as ChecklistsService['listEvents'],
        },
      });

      await expect(controller.listEvents(instanceId, makeRequest(learnerId, ['learner']))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(listEvents).not.toHaveBeenCalled();
    });

    it('allows a learner to read the event timeline of their own instance', async () => {
      const getInstance = jest.fn(async () => ({ userId: learnerId }));
      const listEvents = jest.fn(async () => []);
      const controller = makeController({
        checklistsService: {
          getInstance: getInstance as unknown as ChecklistsService['getInstance'],
          listEvents: listEvents as unknown as ChecklistsService['listEvents'],
        },
      });

      await expect(controller.listEvents(instanceId, makeRequest(learnerId, ['learner']))).resolves.toEqual([]);
      expect(listEvents).toHaveBeenCalledWith(instanceId, organizationId);
    });

    it('requires reviewer-access approval for a privileged role instead of the ownership check', async () => {
      const getInstance = jest.fn();
      const assertReviewerCanAccess = jest.fn(async () => undefined);
      const listEvents = jest.fn(async () => []);
      const controller = makeController({
        checklistsService: {
          getInstance: getInstance as unknown as ChecklistsService['getInstance'],
          listEvents: listEvents as unknown as ChecklistsService['listEvents'],
        },
        reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as unknown as ChecklistReviewAccessService['assertReviewerCanAccess'] },
      });

      await expect(controller.listEvents(instanceId, makeRequest(reviewerId, ['instructor']))).resolves.toEqual([]);
      expect(assertReviewerCanAccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: reviewerId, roles: ['instructor'] }),
        instanceId,
      );
      expect(getInstance).not.toHaveBeenCalled();
    });
  });

  describe('submitItemResult', () => {
    it('lets a learner submit their own item result without a reviewer-access check', async () => {
      const assertReviewerCanAccess = jest.fn(async () => undefined);
      const submitItemResult = jest.fn(async () => ({}));
      const controller = makeController({
        checklistsService: { submitItemResult: submitItemResult as unknown as ChecklistsService['submitItemResult'] },
        reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as unknown as ChecklistReviewAccessService['assertReviewerCanAccess'] },
      });

      await controller.submitItemResult(instanceId, itemId, { checked: true }, makeRequest(learnerId, ['learner']));

      expect(assertReviewerCanAccess).not.toHaveBeenCalled();
      expect(submitItemResult).toHaveBeenCalledWith(instanceId, itemId, organizationId, learnerId, false, { checked: true });
    });

    it('requires reviewer-access approval before a privileged role can submit an item result on someone else\'s behalf', async () => {
      const assertReviewerCanAccess = jest.fn(async () => {
        throw new ForbiddenException();
      });
      const submitItemResult = jest.fn();
      const controller = makeController({
        checklistsService: { submitItemResult: submitItemResult as unknown as ChecklistsService['submitItemResult'] },
        reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as unknown as ChecklistReviewAccessService['assertReviewerCanAccess'] },
      });

      await expect(
        controller.submitItemResult(instanceId, itemId, { checked: true }, makeRequest(reviewerId, ['manager'])),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(submitItemResult).not.toHaveBeenCalled();
    });

    it('marks a privileged submission as non-learner (isPrivileged=true) once reviewer access is granted', async () => {
      const assertReviewerCanAccess = jest.fn(async () => undefined);
      const submitItemResult = jest.fn(async () => ({}));
      const controller = makeController({
        checklistsService: { submitItemResult: submitItemResult as unknown as ChecklistsService['submitItemResult'] },
        reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as unknown as ChecklistReviewAccessService['assertReviewerCanAccess'] },
      });

      await controller.submitItemResult(instanceId, itemId, { checked: true }, makeRequest(reviewerId, ['instructor']));

      expect(submitItemResult).toHaveBeenCalledWith(instanceId, itemId, organizationId, reviewerId, true, { checked: true });
    });
  });

  describe('getItemPhoto', () => {
    it('lets a learner fetch their own item photo without a reviewer-access check', async () => {
      const assertReviewerCanAccess = jest.fn(async () => undefined);
      const getItemPhotoDownload = jest.fn(async () => ({ url: 'signed-url' }));
      const controller = makeController({
        checklistsService: { getItemPhotoDownload: getItemPhotoDownload as unknown as ChecklistsService['getItemPhotoDownload'] },
        reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as unknown as ChecklistReviewAccessService['assertReviewerCanAccess'] },
      });

      await controller.getItemPhoto(instanceId, itemId, makeRequest(learnerId, ['learner']));

      expect(assertReviewerCanAccess).not.toHaveBeenCalled();
      expect(getItemPhotoDownload).toHaveBeenCalledWith(instanceId, itemId, organizationId, learnerId, false);
    });

    it('requires reviewer-access approval before a privileged role can fetch someone else\'s item photo', async () => {
      const assertReviewerCanAccess = jest.fn(async () => {
        throw new ForbiddenException();
      });
      const getItemPhotoDownload = jest.fn();
      const controller = makeController({
        checklistsService: { getItemPhotoDownload: getItemPhotoDownload as unknown as ChecklistsService['getItemPhotoDownload'] },
        reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as unknown as ChecklistReviewAccessService['assertReviewerCanAccess'] },
      });

      await expect(
        controller.getItemPhoto(instanceId, itemId, makeRequest(reviewerId, ['mentor'])),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(getItemPhotoDownload).not.toHaveBeenCalled();
    });
  });
});
