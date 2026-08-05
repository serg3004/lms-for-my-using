import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { hashPassword } from '../auth/passwords.js';
import { UploadService } from '../upload/upload.service.js';
import { CreateOrganizationInput, RegisterOrganizationInput, ThemeSettingsInput } from './organizations.schemas.js';

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
  ) {}

  async listOrganizations(organizationId: string) {
    return this.prisma.organization.findMany({
      where: {
        id: organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
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

  async getThemeSettings(organizationId: string) {
    const themeSettings = await this.findRawThemeSettings(organizationId);

    return { themeSettings: await this.withResolvedLogoUrl(themeSettings) };
  }

  async updateThemeSettings(organizationId: string, themeSettings: ThemeSettingsInput) {
    const existing = (await this.findRawThemeSettings(organizationId)) as StoredThemeSettings | null;

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        themeSettings: {
          ...themeSettings,
          logoObjectKey: existing?.logoObjectKey,
          logoMimeType: existing?.logoMimeType,
        },
      },
      select: { themeSettings: true },
    });

    return { themeSettings: await this.withResolvedLogoUrl(updated.themeSettings) };
  }

  async uploadLogo(organizationId: string, file: Express.Multer.File) {
    const existing = (await this.findRawThemeSettings(organizationId)) as StoredThemeSettings | null;
    const previousLogoObjectKey = existing?.logoObjectKey;

    const logoObjectKey = await this.uploadService.uploadOrganizationLogo(file, organizationId);

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        themeSettings: { ...existing, logoObjectKey, logoMimeType: file.mimetype },
      },
      select: { themeSettings: true },
    });

    if (previousLogoObjectKey) {
      await this.uploadService.deleteObject(previousLogoObjectKey).catch(() => undefined);
    }

    return { themeSettings: await this.withResolvedLogoUrl(updated.themeSettings) };
  }

  async resetThemeSettings(organizationId: string) {
    const existing = (await this.findRawThemeSettings(organizationId)) as StoredThemeSettings | null;

    if (existing?.logoObjectKey) {
      await this.uploadService.deleteObject(existing.logoObjectKey).catch(() => undefined);
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { themeSettings: Prisma.JsonNull },
      select: { id: true },
    });

    return { themeSettings: null };
  }

  private async findRawThemeSettings(organizationId: string): Promise<Prisma.JsonValue | null> {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { themeSettings: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization.themeSettings;
  }

  private async withResolvedLogoUrl(themeSettings: Prisma.JsonValue | null): Promise<Prisma.JsonValue | null> {
    const settings = themeSettings as StoredThemeSettings | null;

    if (!settings?.logoObjectKey) {
      return themeSettings;
    }

    const logoUrl = await this.uploadService.getLogoUrl(settings.logoObjectKey, settings.logoMimeType ?? 'image/png');

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
