import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';
import { ChecklistWorkplaceSettingsService } from './checklist-workplace-settings.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const actorId = '22222222-2222-2222-2222-222222222222';

function fakeAuditLog() {
  return { record: jest.fn(async () => undefined) } as unknown as AuditLogService;
}

describe('ChecklistWorkplaceSettingsService', () => {
  describe('getSettings', () => {
    it('returns the documented safe defaults for a tenant that never wrote a settings row', async () => {
      const prisma = {
        checklistWorkplaceSettings: { findUnique: jest.fn(async () => null) },
      } as unknown as PrismaService;
      const service = new ChecklistWorkplaceSettingsService(prisma, fakeAuditLog());

      await expect(service.getSettings(organizationId)).resolves.toEqual({
        organizationId,
        moduleEnabled: false,
        highPerformanceThreshold: 90,
        criticalThreshold: null,
        lowThreshold: null,
        defaultGeolocationPolicy: 'off',
        feedbackVisibility: 'after_completion',
        updatedAt: null,
      });
    });

    it('never creates a row just to serve a read — a tenant that never touched the feature stays rowless', async () => {
      const findUnique = jest.fn(async () => null);
      const prisma = { checklistWorkplaceSettings: { findUnique } } as unknown as PrismaService;
      const service = new ChecklistWorkplaceSettingsService(prisma, fakeAuditLog());

      await service.getSettings(organizationId);

      expect(findUnique).toHaveBeenCalledWith({ where: { organizationId } });
    });

    it('returns the stored row once a tenant has written its own settings', async () => {
      const updatedAt = new Date('2026-09-22T00:00:00.000Z');
      const prisma = {
        checklistWorkplaceSettings: {
          findUnique: jest.fn(async () => ({
            organizationId,
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
      const service = new ChecklistWorkplaceSettingsService(prisma, fakeAuditLog());

      await expect(service.getSettings(organizationId)).resolves.toEqual({
        organizationId,
        moduleEnabled: true,
        highPerformanceThreshold: 95,
        criticalThreshold: 50,
        lowThreshold: 60,
        defaultGeolocationPolicy: 'required',
        feedbackVisibility: 'live',
        updatedAt,
      });
    });
  });

  describe('updateSettings', () => {
    it('creates a row seeded with defaults merged with the patch, for a first write', async () => {
      const upsert = jest.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        ...create,
        updatedAt: new Date('2026-09-22T00:00:00.000Z'),
      }));
      const prisma = { checklistWorkplaceSettings: { upsert } } as unknown as PrismaService;
      const service = new ChecklistWorkplaceSettingsService(prisma, fakeAuditLog());

      const result = await service.updateSettings(organizationId, { moduleEnabled: true }, actorId);

      expect(upsert).toHaveBeenCalledWith({
        where: { organizationId },
        create: {
          organizationId,
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
      const service = new ChecklistWorkplaceSettingsService(prisma, fakeAuditLog());

      await service.updateSettings(organizationId, { defaultGeolocationPolicy: 'optional' }, actorId);

      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { defaultGeolocationPolicy: 'optional' } }));
    });

    it('records an audit log entry naming the actor and the organization', async () => {
      const prisma = {
        checklistWorkplaceSettings: {
          upsert: jest.fn(async () => ({
            organizationId,
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
      const service = new ChecklistWorkplaceSettingsService(prisma, auditLog);

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
