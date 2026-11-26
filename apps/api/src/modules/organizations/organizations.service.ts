import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { loadLoginProtection, type LoginProtection } from '../../common/login-protection.js';
import { loadBadgePolicy, type BadgePolicy } from '../../common/badge.js';
import { loadVoicePolicy, type VoicePolicy } from '../../common/voice-policy.js';
import { loadQrLoginPolicy, type QrLoginPolicy } from '../../common/qr-login.js';
import { assertPasswordPolicy, defaultPasswordPolicy } from '../../common/password-policy.js';
import { hashPassword } from '../auth/public.js';
import { UploadService } from '../upload/public.js';
import { BadgePolicyInput, CreateOrganizationInput, LoginProtectionInput, OrganizationFeaturesInput, PasswordPolicyInput, QrLoginPolicyInput, RegisterOrganizationInput, ThemeSettingsInput, VoicePolicyInput } from './organizations.schemas.js';

type StoredThemeSettings = Partial<ThemeSettingsInput> & { logoObjectKey?: string; logoMimeType?: string };

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  plan: true,
  createdAt: true,
  updatedAt: true,
} as const;

const firstAdminSelect = {
  id: true,
  organizationId: true,
  email: true,
  firstName: true,
  lastName: true,
  middleName: true,
  position: true,
  shift: true,
  phone: true,
  status: true,
  locale: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  async listOrganizations(organizationId: string) {
    return this.prisma.organization.findMany({
      where: {
        id: organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: organizationSelect,
    });
  }

  async getOrganization(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        deletedAt: null,
      },
      select: organizationSelect,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async createOrganization(input: CreateOrganizationInput) {
    await this.ensureOrganizationSlugIsAvailable(input.slug);

    return this.prisma.organization.create({
      data: input,
      select: organizationSelect,
    });
  }

  async registerOrganization(input: RegisterOrganizationInput) {
    await this.ensureOrganizationSlugIsAvailable(input.organization.slug);
    await this.ensureAdminEmailIsAvailable(input.admin.email);

    const { password, ...adminData } = input.admin;
    // A new organization starts with the default policy.
    assertPasswordPolicy(password, defaultPasswordPolicy, input.admin);
    const passwordHash = await hashPassword(password);

    const [organization, admin] = await this.prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: input.organization,
        select: organizationSelect,
      });

      const admin = await transaction.user.create({
        data: {
          ...adminData,
          organizationId: organization.id,
          passwordHash,
        },
        select: firstAdminSelect,
      });

      await transaction.membership.create({
        data: {
          organizationId: organization.id,
          userId: admin.id,
          role: 'admin',
        },
        select: { id: true },
      });

      return [organization, admin] as const;
    });

    return {
      organization,
      admin,
    };
  }

  async getFeatures(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { longreadEnabled: true, customRolesEnabled: true, telegramDeliveryEnabled: true },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    return { longreadEnabled: organization.longreadEnabled, customRolesEnabled: organization.customRolesEnabled, telegramDeliveryEnabled: organization.telegramDeliveryEnabled };
  }

  async updateFeatures(organizationId: string, input: OrganizationFeaturesInput, actorId: string | null = null) {
    const existing = await this.getFeatures(organizationId);
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        longreadEnabled: input.longreadEnabled,
        ...(input.customRolesEnabled === undefined ? {} : { customRolesEnabled: input.customRolesEnabled }),
        ...(input.telegramDeliveryEnabled === undefined ? {} : { telegramDeliveryEnabled: input.telegramDeliveryEnabled }),
      },
      select: { longreadEnabled: true, customRolesEnabled: true, telegramDeliveryEnabled: true },
    });

    if (existing.longreadEnabled !== updated.longreadEnabled) {
      await this.auditLog.record({
        organizationId,
        actorId,
        action: 'organization.features_updated',
        targetType: 'organization',
        targetId: organizationId,
        summary: `Longread lessons ${updated.longreadEnabled ? 'enabled' : 'disabled'}`,
        metadata: { longreadEnabled: updated.longreadEnabled },
      });
    }
    if (existing.customRolesEnabled !== updated.customRolesEnabled) {
      await this.auditLog.record({
        organizationId,
        actorId,
        action: 'organization.features_updated',
        targetType: 'organization',
        targetId: organizationId,
        summary: `Custom roles ${updated.customRolesEnabled ? 'enabled' : 'disabled'}`,
        metadata: { customRolesEnabled: updated.customRolesEnabled },
      });
    }

    if (existing.telegramDeliveryEnabled !== updated.telegramDeliveryEnabled) {
      await this.auditLog.record({
        organizationId,
        actorId,
        action: 'organization.features_updated',
        targetType: 'organization',
        targetId: organizationId,
        summary: `Telegram delivery ${updated.telegramDeliveryEnabled ? 'enabled' : 'disabled'}`,
        metadata: { telegramDeliveryEnabled: updated.telegramDeliveryEnabled },
      });
    }

    return { longreadEnabled: updated.longreadEnabled, customRolesEnabled: updated.customRolesEnabled, telegramDeliveryEnabled: updated.telegramDeliveryEnabled };
  }

  async getPasswordPolicy(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { passwordMinLength: true, passwordHistoryCount: true },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    return { minLength: organization.passwordMinLength, historyCount: organization.passwordHistoryCount };
  }

  /** Stricter or looser, the new policy applies to passwords set from now on; existing passwords are not touched. */
  async updatePasswordPolicy(organizationId: string, input: PasswordPolicyInput, actorId: string | null = null) {
    const existing = await this.getPasswordPolicy(organizationId);
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { passwordMinLength: input.minLength, passwordHistoryCount: input.historyCount },
      select: { passwordMinLength: true, passwordHistoryCount: true },
    });
    const policy = { minLength: updated.passwordMinLength, historyCount: updated.passwordHistoryCount };

    if (existing.minLength !== policy.minLength || existing.historyCount !== policy.historyCount) {
      await this.auditLog.record({
        organizationId,
        actorId,
        action: 'organization.password_policy_updated',
        targetType: 'organization',
        targetId: organizationId,
        summary: `Password policy: minimum length ${policy.minLength}, remembered passwords ${policy.historyCount}`,
        metadata: { before: existing, after: policy },
      });
    }
    return policy;
  }

  async getQrLoginPolicy(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({ where: { id: organizationId }, select: { id: true } });
    if (!organization) throw new NotFoundException('Organization not found');
    return loadQrLoginPolicy(this.prisma, organizationId);
  }

  /** PR 505: applies to the next request; sessions already opened by QR end at their own term (or when the person ends them). */
  async updateQrLoginPolicy(organizationId: string, input: QrLoginPolicyInput, actorId: string | null = null) {
    const existing = await this.getQrLoginPolicy(organizationId);
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { qrLoginEnabled: input.enabled, qrLoginSessionHours: input.sessionHours, qrLoginRoles: input.roles },
    });
    const updated: QrLoginPolicy = { enabled: input.enabled, sessionHours: input.sessionHours, roles: input.roles };
    if (JSON.stringify(existing) !== JSON.stringify(updated)) {
      await this.auditLog.record({
        organizationId,
        actorId,
        action: 'organization.qr_login_updated',
        targetType: 'organization',
        targetId: organizationId,
        summary: `Sign-in by QR: ${updated.enabled ? 'on' : 'off'}, session ${updated.sessionHours} h, roles ${updated.roles.join(', ') || 'none'}`,
        metadata: { before: existing, after: updated },
      });
    }
    return updated;
  }

  async getBadgePolicy(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({ where: { id: organizationId }, select: { id: true } });
    if (!organization) throw new NotFoundException('Organization not found');
    return loadBadgePolicy(this.prisma, organizationId);
  }

  /** PR 506: applies to the next scan; open kiosk sessions keep their idle time until they renew. */
  async updateBadgePolicy(organizationId: string, input: BadgePolicyInput, actorId: string | null = null) {
    const existing = await this.getBadgePolicy(organizationId);
    await this.prisma.organization.update({ where: { id: organizationId }, data: { badgePinRequired: input.pinRequired, badgeIdleMinutes: input.idleMinutes } });
    const updated: BadgePolicy = { pinRequired: input.pinRequired, idleMinutes: input.idleMinutes };
    if (JSON.stringify(existing) !== JSON.stringify(updated)) {
      await this.auditLog.record({
        organizationId, actorId, action: 'organization.badge_policy_updated', targetType: 'organization', targetId: organizationId,
        summary: `Badge sign-in: PIN ${updated.pinRequired ? 'required' : 'not required'}, idle ${updated.idleMinutes} min`,
        metadata: { before: existing, after: updated },
      });
    }
    return updated;
  }

  async getVoicePolicy(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({ where: { id: organizationId }, select: { id: true } });
    if (!organization) throw new NotFoundException('Organization not found');
    return loadVoicePolicy(this.prisma, organizationId);
  }

  /**
   * PR 511: applies to the next recording; saved recordings stay. The write only succeeds against the version the
   * administrator saw, so two administrators cannot overwrite each other unnoticed (409).
   */
  async updateVoicePolicy(organizationId: string, input: VoicePolicyInput, actorId: string | null = null) {
    const existing = await this.getVoicePolicy(organizationId);
    const changed = await this.prisma.organization.updateMany({
      where: { id: organizationId, voiceSettingsVersion: input.version },
      data: {
        dictationEnabled: input.dictationEnabled,
        voiceNotesEnabled: input.voiceNotesEnabled,
        voiceNoteMaxSeconds: input.maxSeconds,
        voiceNotesPerComment: input.perComment,
        voiceSettingsVersion: { increment: 1 },
      },
    });
    if (changed.count === 0) throw new ConflictException('The settings were changed by someone else; reload and try again');
    const updated: VoicePolicy = { dictationEnabled: input.dictationEnabled, voiceNotesEnabled: input.voiceNotesEnabled, maxSeconds: input.maxSeconds, perComment: input.perComment, version: input.version + 1 };
    const before = { dictationEnabled: existing.dictationEnabled, voiceNotesEnabled: existing.voiceNotesEnabled, maxSeconds: existing.maxSeconds, perComment: existing.perComment };
    const after = { dictationEnabled: updated.dictationEnabled, voiceNotesEnabled: updated.voiceNotesEnabled, maxSeconds: updated.maxSeconds, perComment: updated.perComment };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await this.auditLog.record({
        organizationId, actorId, action: 'organization.voice_policy_updated', targetType: 'organization', targetId: organizationId,
        summary: `Checklist comments: dictation ${updated.dictationEnabled ? 'on' : 'off'}, voice ${updated.voiceNotesEnabled ? 'on' : 'off'}, ${updated.maxSeconds} s, ${updated.perComment} per comment`,
        metadata: { before, after },
      });
    }
    return updated;
  }

  async getLoginProtection(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({ where: { id: organizationId }, select: { id: true } });
    if (!organization) throw new NotFoundException('Organization not found');

    return loadLoginProtection(this.prisma, organizationId);
  }

  /** PR 493: new limits apply to the next failed attempt; accounts that are already locked keep their lock until an administrator lifts it. */
  async updateLoginProtection(organizationId: string, input: LoginProtectionInput, actorId: string | null = null) {
    const existing = await this.getLoginProtection(organizationId);
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { loginMaxFailures: input.maxFailures, loginFailureWindowMinutes: input.windowMinutes, loginLockMinutes: input.lockMinutes, loginLogRetentionDays: input.logRetentionDays ?? existing.logRetentionDays },
    });
    const updated: LoginProtection = { maxFailures: input.maxFailures, windowMinutes: input.windowMinutes, lockMinutes: input.lockMinutes, logRetentionDays: input.logRetentionDays ?? existing.logRetentionDays };

    if (existing.maxFailures !== updated.maxFailures || existing.windowMinutes !== updated.windowMinutes || existing.lockMinutes !== updated.lockMinutes || existing.logRetentionDays !== updated.logRetentionDays) {
      await this.auditLog.record({
        organizationId,
        actorId,
        action: 'organization.login_protection_updated',
        targetType: 'organization',
        targetId: organizationId,
        summary: `Sign-in protection: ${updated.maxFailures} failures in ${updated.windowMinutes} min lock for ${updated.lockMinutes} min, sign-in log kept ${updated.logRetentionDays} days`,
        metadata: { before: existing, after: updated },
      });
    }
    return updated;
  }

  async getThemeSettings(organizationId: string) {
    const themeSettings = await this.findRawThemeSettings(organizationId);

    return { themeSettings: await this.withResolvedLogoUrl(themeSettings) };
  }

  async updateThemeSettings(organizationId: string, themeSettings: ThemeSettingsInput, actorId: string | null = null) {
    const existing = (await this.findRawThemeSettings(organizationId)) as StoredThemeSettings | null;

    const updated = await this.prisma.organizationTheme.upsert({
      where: { organizationId },
      create: {
        organizationId,
        settings: themeSettings,
        logoObjectKey: existing?.logoObjectKey,
        logoMimeType: existing?.logoMimeType,
      },
      update: { settings: themeSettings },
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'organization.theme_updated',
      targetType: 'organization',
      targetId: organizationId,
      summary: 'Updated organization theme settings',
    });

    return { themeSettings: await this.withResolvedLogoUrl(this.toStoredThemeSettings(updated)) };
  }

  async uploadLogo(organizationId: string, file: Express.Multer.File) {
    const existing = (await this.findRawThemeSettings(organizationId)) as StoredThemeSettings | null;
    const previousLogoObjectKey = existing?.logoObjectKey;

    const logoObjectKey = await this.uploadService.uploadOrganizationLogo(file, organizationId);

    const updated = await this.prisma.organizationTheme.upsert({
      where: { organizationId },
      create: {
        organizationId,
        settings: this.settingsDocument(existing),
        logoObjectKey,
        logoMimeType: file.mimetype,
      },
      update: { logoObjectKey, logoMimeType: file.mimetype },
    });

    if (previousLogoObjectKey) {
      await this.uploadService.deleteObject(previousLogoObjectKey).catch(() => undefined);
    }

    return { themeSettings: await this.withResolvedLogoUrl(this.toStoredThemeSettings(updated)) };
  }

  async resetThemeSettings(organizationId: string, actorId: string | null = null) {
    const existing = (await this.findRawThemeSettings(organizationId)) as StoredThemeSettings | null;

    if (existing?.logoObjectKey) {
      await this.uploadService.deleteObject(existing.logoObjectKey).catch(() => undefined);
    }

    await this.prisma.organizationTheme.deleteMany({ where: { organizationId } });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'organization.theme_reset',
      targetType: 'organization',
      targetId: organizationId,
      summary: 'Reset organization theme settings to defaults',
    });

    return { themeSettings: null };
  }

  private async findRawThemeSettings(organizationId: string): Promise<Prisma.JsonValue | null> {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { theme: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization.theme ? (this.toStoredThemeSettings(organization.theme) as unknown as Prisma.JsonValue) : null;
  }

  private toStoredThemeSettings(theme: { settings: Prisma.JsonValue; logoObjectKey: string | null; logoMimeType: string | null }) {
    return {
      ...(theme.settings as Partial<ThemeSettingsInput>),
      ...(theme.logoObjectKey ? { logoObjectKey: theme.logoObjectKey } : {}),
      ...(theme.logoMimeType ? { logoMimeType: theme.logoMimeType } : {}),
    };
  }

  private settingsDocument(theme: StoredThemeSettings | null): Prisma.InputJsonValue {
    if (!theme) return {};

    const settings = { ...theme };
    delete settings.logoObjectKey;
    delete settings.logoMimeType;

    return settings as Prisma.InputJsonValue;
  }

  private async withResolvedLogoUrl(themeSettings: Prisma.JsonValue | null): Promise<Prisma.JsonValue | null> {
    const settings = themeSettings as StoredThemeSettings | null;

    if (!settings?.logoObjectKey) {
      return themeSettings;
    }

    const logoUrl = await this.uploadService.getInlinePresignedUrl(settings.logoObjectKey, settings.logoMimeType ?? 'image/png');

    return { ...settings, logoUrl } as unknown as Prisma.JsonValue;
  }

  private async ensureOrganizationSlugIsAvailable(slug: string) {
    const existingOrganization = await this.prisma.organization.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existingOrganization) {
      throw new ConflictException('Organization slug already exists');
    }
  }

  private async ensureAdminEmailIsAvailable(email: string) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Admin email already exists');
    }
  }
}
