import { UnprocessableEntityException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';
import { DEFAULT_OBSERVER_SELECTION } from './checklist-observer-eligibility.js';
import { updateChecklistWorkplaceSettingsSchema } from './checklists.schemas.js';
import { ChecklistWorkplaceSettingsService } from './checklist-workplace-settings.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const actorId = '22222222-2222-2222-2222-222222222222';

function withTransactions(prisma: PrismaService): PrismaService {
  if (!prisma.checklistWorkplaceSettings.findUnique) Object.assign(prisma.checklistWorkplaceSettings, { findUnique: jest.fn(async () => null) });
  Object.assign(prisma, { $transaction: jest.fn(async (fn: (tx: PrismaService) => Promise<unknown>) => fn(prisma)) });
  return prisma;
}

function fakeAuditLog() {
  return { record: jest.fn(async () => undefined) } as unknown as AuditLogService;
}

describe('ChecklistWorkplaceSettingsService', () => {
  describe('getSettings', () => {
    it('returns the documented safe defaults for a tenant that never wrote a settings row', async () => {
      const prisma = {
        checklistWorkplaceSettings: { findUnique: jest.fn(async () => null) },
      } as unknown as PrismaService;
      const service = new ChecklistWorkplaceSettingsService(withTransactions(prisma), fakeAuditLog());

      await expect(service.getSettings(organizationId)).resolves.toEqual({
        organizationId,
        ...DEFAULT_OBSERVER_SELECTION,
        moduleEnabled: false,
        highPerformanceThreshold: 90,
        criticalThreshold: null,
        lowThreshold: null,
        resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' },
        defaultGeolocationPolicy: 'off',
        feedbackVisibility: 'after_completion',
        updatedAt: null,
      });
    });

    it('never creates a row just to serve a read — a tenant that never touched the feature stays rowless', async () => {
      const findUnique = jest.fn(async () => null);
      const prisma = { checklistWorkplaceSettings: { findUnique } } as unknown as PrismaService;
      const service = new ChecklistWorkplaceSettingsService(withTransactions(prisma), fakeAuditLog());

      await service.getSettings(organizationId);

      expect(findUnique).toHaveBeenCalledWith({ where: { organizationId } });
    });

    it('returns the stored row once a tenant has written its own settings', async () => {
      const updatedAt = new Date('2026-09-22T00:00:00.000Z');
      const prisma = {
        checklistWorkplaceSettings: {
          findUnique: jest.fn(async () => ({
            organizationId,
        ...DEFAULT_OBSERVER_SELECTION,
        moduleEnabled: true,
            highPerformanceThreshold: 95,
            criticalThreshold: 50,
            lowThreshold: 60,
            defaultGeolocationPolicy: 'required',
            feedbackVisibility: 'live',
            updatedAt,
          })),
        },
      } as unknown as PrismaService;
      const service = new ChecklistWorkplaceSettingsService(withTransactions(prisma), fakeAuditLog());

      await expect(service.getSettings(organizationId)).resolves.toEqual({
        organizationId,
        ...DEFAULT_OBSERVER_SELECTION,
        moduleEnabled: true,
        highPerformanceThreshold: 95,
        criticalThreshold: 50,
        lowThreshold: 60,
        resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' },
        defaultGeolocationPolicy: 'required',
        feedbackVisibility: 'live',
        updatedAt,
      });
    });
  });

  describe('result colours (PR 369б)', () => {
    it('resolves stored band colours and falls back to the defaults for unset ones', async () => {
      const prisma = {
        checklistWorkplaceSettings: {
          findUnique: jest.fn(async () => ({
            organizationId, ...DEFAULT_OBSERVER_SELECTION, moduleEnabled: true, highPerformanceThreshold: 90, criticalThreshold: null,
            lowThreshold: 60, resultColorLow: '#112233', resultColorMid: null, resultColorHigh: '#445566',
            defaultGeolocationPolicy: 'off', feedbackVisibility: 'live', updatedAt: new Date(),
          })),
        },
      } as unknown as PrismaService;
      const service = new ChecklistWorkplaceSettingsService(withTransactions(prisma), fakeAuditLog());

      expect((await service.getSettings(organizationId)).resultColors).toEqual({ low: '#112233', mid: '#F9A825', high: '#445566' });
    });

    it('accepts only #RRGGBB (stored upper-case) and rejects CSS', () => {
      expect(updateChecklistWorkplaceSettingsSchema.parse({ resultColorLow: '#aabbcc', resultColorMid: null })).toEqual({ resultColorLow: '#AABBCC', resultColorMid: null });
      for (const bad of ['red', '#abc', 'url(javascript:alert(1))', '#12345g', '#1234567', 'rgb(1,2,3)']) {
        expect(updateChecklistWorkplaceSettingsSchema.safeParse({ resultColorHigh: bad }).success).toBe(false);
      }
    });

    it('rejects a low threshold that is not below the high one (overlapping ranges) with 422', async () => {
      const prisma = {
        checklistWorkplaceSettings: { findUnique: jest.fn(async () => null), upsert: jest.fn() },
      } as unknown as PrismaService;
      const service = new ChecklistWorkplaceSettingsService(withTransactions(prisma), fakeAuditLog());

      await expect(service.updateSettings(organizationId, { highPerformanceThreshold: 70, lowThreshold: 70 }, actorId)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.checklistWorkplaceSettings.upsert).not.toHaveBeenCalled();
    });
  });

  describe('updateSettings', () => {
    it('creates a row seeded with defaults merged with the patch, for a first write', async () => {
      const upsert = jest.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        ...create,
        updatedAt: new Date('2026-09-22T00:00:00.000Z'),
      }));
      const prisma = { checklistWorkplaceSettings: { upsert } } as unknown as PrismaService;
      const service = new ChecklistWorkplaceSettingsService(withTransactions(prisma), fakeAuditLog());

      const result = await service.updateSettings(organizationId, { moduleEnabled: true }, actorId);

      expect(upsert).toHaveBeenCalledWith({
        where: { organizationId },
        create: {
          organizationId,
        ...DEFAULT_OBSERVER_SELECTION,
        moduleEnabled: true,
          highPerformanceThreshold: 90,
          criticalThreshold: null,
          lowThreshold: null,
          defaultGeolocationPolicy: 'off',
          feedbackVisibility: 'after_completion',
        },
        update: { moduleEnabled: true },
      });
      expect(result.moduleEnabled).toBe(true);
    });

    it('patches only the given fields on an existing row, leaving the rest untouched', async () => {
      const upsert = jest.fn(async ({ update }: { update: Record<string, unknown> }) => ({
        organizationId,
        ...DEFAULT_OBSERVER_SELECTION,
        moduleEnabled: true,
        highPerformanceThreshold: 90,
        criticalThreshold: null,
        lowThreshold: null,
        defaultGeolocationPolicy: 'off',
        feedbackVisibility: 'after_completion',
        updatedAt: new Date(),
        ...update,
      }));
      const prisma = { checklistWorkplaceSettings: { upsert } } as unknown as PrismaService;
      const service = new ChecklistWorkplaceSettingsService(withTransactions(prisma), fakeAuditLog());

      await service.updateSettings(organizationId, { defaultGeolocationPolicy: 'optional' }, actorId);

      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { defaultGeolocationPolicy: 'optional' } }));
    });

    it('records an audit log entry naming the actor and the organization', async () => {
      const prisma = {
        checklistWorkplaceSettings: {
          upsert: jest.fn(async () => ({
            organizationId,
        ...DEFAULT_OBSERVER_SELECTION,
        moduleEnabled: true,
            highPerformanceThreshold: 90,
            criticalThreshold: null,
            lowThreshold: null,
            defaultGeolocationPolicy: 'off',
            feedbackVisibility: 'after_completion',
            updatedAt: new Date(),
          })),
        },
      } as unknown as PrismaService;
      const auditLog = fakeAuditLog();
      const service = new ChecklistWorkplaceSettingsService(withTransactions(prisma), auditLog);

      await service.updateSettings(organizationId, { moduleEnabled: true }, actorId);

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId,
          actorId,
          action: 'checklist_workplace_settings.updated',
          targetType: 'checklist_workplace_settings',
          targetId: organizationId,
        }),
      );
    });
  });
});


describe('observer settings schema (PR 351)', () => {
  it.each([
    { observerEligibility: 'unknown' }, { observerRoles: ['admin', 'admin'] },
    { observerRoles: ['observer'] }, { observerUserIds: [actorId, actorId] },
    { observerUserIds: ['invalid'] }, { observerUserIds: Array(501).fill(actorId) },
  ])('rejects invalid selection %j', (input) => {
    expect(updateChecklistWorkplaceSettingsSchema.safeParse(input).success).toBe(false);
  });
});
