import { ForbiddenException } from '@nestjs/common';
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
const otherLearnerId = '55555555-5555-5555-5555-555555555555';
const reviewerId = '66666666-6666-6666-6666-666666666666';

function makeRequest(userId: string, roles: string[]): AuthenticatedRequest {
  return { currentUser: { id: userId, organizationId, roles } } as unknown as AuthenticatedRequest;
}

function makeController(overrides: {
  checklistsService?: Partial<ChecklistsService>;
  reviewAccess?: Partial<ChecklistReviewAccessService>;
  uploadService?: Partial<UploadService>;
  workplaceSettings?: Partial<ChecklistWorkplaceSettingsService>;
} = {}) {
  const checklistsService = overrides.checklistsService ?? {};
  const reviewAccess = { isAssignedObserver: jest.fn(async () => false), ...overrides.reviewAccess };
  const uploadService = overrides.uploadService ?? {};
  const workplaceSettings = overrides.workplaceSettings ?? {};

  return new ChecklistsController(
    checklistsService as ChecklistsService,
    uploadService as UploadService,
    reviewAccess as ChecklistReviewAccessService,
    workplaceSettings as ChecklistWorkplaceSettingsService,
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

  describe('workplace settings', () => {
    it('reads settings scoped to the caller\'s own organization, never a caller-supplied one', async () => {
      const getSettings = jest.fn(async () => ({ moduleEnabled: false }));
      const controller = makeController({
        workplaceSettings: { getSettings: getSettings as unknown as ChecklistWorkplaceSettingsService['getSettings'] },
      });

      await controller.getWorkplaceSettings(makeRequest(learnerId, ['learner']));

      expect(getSettings).toHaveBeenCalledWith(organizationId, false);
    });

    it('writes settings with the caller as actor, scoped to their own organization', async () => {
      const updateSettings = jest.fn(async () => ({ moduleEnabled: true }));
      const controller = makeController({
        workplaceSettings: { updateSettings: updateSettings as unknown as ChecklistWorkplaceSettingsService['updateSettings'] },
      });

      await controller.updateWorkplaceSettings({ moduleEnabled: true }, makeRequest(reviewerId, ['admin']));

      expect(updateSettings).toHaveBeenCalledWith(organizationId, { moduleEnabled: true }, reviewerId);
    });

    it('rejects an unknown field instead of silently accepting it', async () => {
      const updateSettings = jest.fn();
      const controller = makeController({
        workplaceSettings: { updateSettings: updateSettings as unknown as ChecklistWorkplaceSettingsService['updateSettings'] },
      });

      await expect(
        controller.updateWorkplaceSettings({ moduleEnabled: true, notARealField: 1 }, makeRequest(reviewerId, ['admin'])),
      ).rejects.toThrow();
      expect(updateSettings).not.toHaveBeenCalled();
    });

    it('rejects a criticalThreshold set below lowThreshold in the same request', async () => {
      const updateSettings = jest.fn();
      const controller = makeController({
        workplaceSettings: { updateSettings: updateSettings as unknown as ChecklistWorkplaceSettingsService['updateSettings'] },
      });

      await expect(
        controller.updateWorkplaceSettings(
          { criticalThreshold: 40, lowThreshold: 60 },
          makeRequest(reviewerId, ['admin']),
        ),
      ).rejects.toThrow();
      expect(updateSettings).not.toHaveBeenCalled();
    });

    it('accepts clearing a previously-set threshold back to null', async () => {
      const updateSettings = jest.fn(async () => ({}));
      const controller = makeController({
        workplaceSettings: { updateSettings: updateSettings as unknown as ChecklistWorkplaceSettingsService['updateSettings'] },
      });

      await controller.updateWorkplaceSettings({ criticalThreshold: null }, makeRequest(reviewerId, ['admin']));

      expect(updateSettings).toHaveBeenCalledWith(organizationId, { criticalThreshold: null }, reviewerId);
    });
  });

  describe('free-access checklists (PR 353)', () => {
    const checklistId = '77777777-7777-7777-7777-777777777777';

    it('starts a free checklist for the caller in the caller\'s own organization', async () => {
      const startFreeChecklist = jest.fn(async () => ({ id: instanceId }));
      const controller = makeController({
        checklistsService: { startFreeChecklist: startFreeChecklist as unknown as ChecklistsService['startFreeChecklist'] },
      });

      await controller.startFreeChecklist(checklistId, makeRequest(learnerId, ['learner']));

      expect(startFreeChecklist).toHaveBeenCalledWith(checklistId, organizationId, learnerId);
    });

    it('lists the catalog for the caller\'s own organization and user', async () => {
      const listFreeChecklists = jest.fn(async () => []);
      const controller = makeController({
        checklistsService: { listFreeChecklists: listFreeChecklists as unknown as ChecklistsService['listFreeChecklists'] },
      });

      await controller.listFreeChecklists(makeRequest(learnerId, ['learner']));

      expect(listFreeChecklists).toHaveBeenCalledWith(organizationId, learnerId);
    });
  });

  it.each(['learner', 'mentor'] as const)('allows the assigned %s observer to submit results without reviewer powers', async (role) => {
    const submitItemResult = jest.fn(async () => ({ id: instanceId }));
    const assertReviewerCanAccess = jest.fn(async () => undefined);
    const controller = makeController({
      checklistsService: { submitItemResult: submitItemResult as unknown as ChecklistsService['submitItemResult'] },
      reviewAccess: { isAssignedObserver: jest.fn(async () => true), assertReviewerCanAccess },
    });
    await expect(controller.submitItemResult(instanceId, itemId, { checked: true }, makeRequest(reviewerId, [role]))).resolves.toEqual({ id: instanceId });
    expect(submitItemResult).toHaveBeenCalledWith(instanceId, itemId, organizationId, reviewerId, true, { checked: true });
    expect(assertReviewerCanAccess).not.toHaveBeenCalled();
  });

  describe('hand-over of a check (PR 477)', () => {
    const colleagueId = '77777777-7777-7777-7777-777777777777';
    function transferController() {
      const transferInstance = jest.fn(async () => ({ id: instanceId, userId: colleagueId }));
      const transferInstanceCandidates = jest.fn(async () => []);
      const listTransferHistory = jest.fn(async () => []);
      const getInstance = jest.fn(async () => ({ userId: learnerId }));
      const assertReviewerCanAccess = jest.fn(async () => undefined);
      const controller = makeController({
        checklistsService: {
          transferInstance: transferInstance as unknown as ChecklistsService['transferInstance'],
          transferInstanceCandidates: transferInstanceCandidates as unknown as ChecklistsService['transferInstanceCandidates'],
          listTransferHistory: listTransferHistory as unknown as ChecklistsService['listTransferHistory'],
          getInstance: getInstance as unknown as ChecklistsService['getInstance'],
        },
        reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as unknown as ChecklistReviewAccessService['assertReviewerCanAccess'] },
      });
      return { controller, transferInstance, transferInstanceCandidates, listTransferHistory, assertReviewerCanAccess };
    }

    it('passes the learner straight to the service, which checks that they are the executor', async () => {
      const { controller, transferInstance, assertReviewerCanAccess } = transferController();
      await controller.transferInstance(instanceId, { toUserId: colleagueId, note: 'Hi' }, makeRequest(learnerId, ['learner']));
      expect(transferInstance).toHaveBeenCalledWith(instanceId, expect.objectContaining({ id: learnerId, organizationId }), { toUserId: colleagueId, note: 'Hi' });
      expect(assertReviewerCanAccess).not.toHaveBeenCalled();
    });

    it('limits a manager to their team before the service is called, but does not limit an administrator', async () => {
      const manager = transferController();
      await manager.controller.transferInstance(instanceId, { toUserId: colleagueId }, makeRequest(reviewerId, ['manager']));
      expect(manager.assertReviewerCanAccess).toHaveBeenCalledWith(expect.objectContaining({ id: reviewerId }), instanceId);
      await manager.controller.transferCandidates(instanceId, makeRequest(reviewerId, ['manager']));
      expect(manager.assertReviewerCanAccess).toHaveBeenCalledTimes(2);
      const admin = transferController();
      await admin.controller.transferInstance(instanceId, { toUserId: colleagueId }, makeRequest(reviewerId, ['admin']));
      expect(admin.assertReviewerCanAccess).not.toHaveBeenCalled();
    });

    it('rejects a body with an unknown field, a bad id or a note that is too long, before anything is read', async () => {
      const { controller, transferInstance } = transferController();
      const request = makeRequest(learnerId, ['learner']);
      await expect(controller.transferInstance(instanceId, { toUserId: 'not-an-id' }, request)).rejects.toBeDefined();
      await expect(controller.transferInstance(instanceId, { toUserId: colleagueId, userId: learnerId }, request)).rejects.toBeDefined();
      await expect(controller.transferInstance(instanceId, { toUserId: colleagueId, note: 'x'.repeat(501) }, request)).rejects.toBeDefined();
      expect(transferInstance).not.toHaveBeenCalled();
    });

    it('shows the history only to the executor among learners, and to reviewers inside their scope', async () => {
      const { controller, listTransferHistory, assertReviewerCanAccess } = transferController();
      await expect(controller.listTransferHistory(instanceId, makeRequest(otherLearnerId, ['learner']))).rejects.toBeInstanceOf(ForbiddenException);
      expect(listTransferHistory).not.toHaveBeenCalled();
      await controller.listTransferHistory(instanceId, makeRequest(learnerId, ['learner']));
      await controller.listTransferHistory(instanceId, makeRequest(reviewerId, ['instructor']));
      expect(assertReviewerCanAccess).toHaveBeenCalledTimes(1);
      expect(listTransferHistory).toHaveBeenCalledTimes(2);
    });
  });

  describe('report of a filled-in check (PR 478)', () => {
    function reportController() {
      const getInstanceReport = jest.fn(async () => ({ visible: true }));
      const getInstanceReportPdf = jest.fn(async () => ({ filename: 'checklist-x.pdf', pdf: Buffer.from('%PDF-') }));
      const getInstance = jest.fn(async () => ({ userId: learnerId }));
      const assertReviewerCanAccess = jest.fn(async () => undefined);
      const controller = makeController({
        checklistsService: {
          getInstanceReport: getInstanceReport as unknown as ChecklistsService['getInstanceReport'],
          getInstanceReportPdf: getInstanceReportPdf as unknown as ChecklistsService['getInstanceReportPdf'],
          getInstance: getInstance as unknown as ChecklistsService['getInstance'],
        },
        reviewAccess: { assertReviewerCanAccess: assertReviewerCanAccess as unknown as ChecklistReviewAccessService['assertReviewerCanAccess'] },
      });
      return { controller, getInstanceReport, getInstanceReportPdf, assertReviewerCanAccess };
    }

    it('lets the executor read it as a learner (points follow the sheet) and refuses another learner', async () => {
      const { controller, getInstanceReport } = reportController();
      await controller.getInstanceReport(instanceId, makeRequest(learnerId, ['learner']));
      expect(getInstanceReport).toHaveBeenCalledWith(instanceId, expect.objectContaining({ id: learnerId, organizationId, privileged: false }));
      await expect(controller.getInstanceReport(instanceId, makeRequest(otherLearnerId, ['learner']))).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.downloadInstanceReportPdf(instanceId, makeRequest(otherLearnerId, ['learner']), {} as never)).rejects.toBeInstanceOf(ForbiddenException);
      expect(getInstanceReport).toHaveBeenCalledTimes(1);
    });

    it('limits staff to their area and gives them the points, but does not limit an administrator', async () => {
      const staff = reportController();
      await staff.controller.getInstanceReport(instanceId, makeRequest(reviewerId, ['manager']));
      expect(staff.assertReviewerCanAccess).toHaveBeenCalledWith(expect.objectContaining({ id: reviewerId }), instanceId);
      expect(staff.getInstanceReport).toHaveBeenCalledWith(instanceId, expect.objectContaining({ privileged: true }));
      const admin = reportController();
      await admin.controller.getInstanceReport(instanceId, makeRequest(reviewerId, ['admin']));
      expect(admin.assertReviewerCanAccess).toHaveBeenCalledTimes(1);
    });

    it('sends the PDF as an attachment that is never cached', async () => {
      const { controller } = reportController();
      const set = jest.fn();
      const send = jest.fn();
      await controller.downloadInstanceReportPdf(instanceId, makeRequest(learnerId, ['learner']), { set, send } as never);
      expect(set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'attachment; filename="checklist-x.pdf"' }));
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

});
