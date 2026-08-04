import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { hashPassword } from '../auth/passwords.js';
import { CreateOrganizationInput, RegisterOrganizationInput, ThemeSettingsInput } from './organizations.schemas.js';

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
  constructor(private readonly prisma: PrismaService) {}

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
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        deletedAt: null,
      },
      select: { themeSettings: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return { themeSettings: organization.themeSettings };
  }

  async updateThemeSettings(organizationId: string, themeSettings: ThemeSettingsInput) {
    await this.getThemeSettings(organizationId);

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { themeSettings },
      select: { themeSettings: true },
    });

    return { themeSettings: updated.themeSettings };
  }

  async resetThemeSettings(organizationId: string) {
    await this.getThemeSettings(organizationId);

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { themeSettings: Prisma.JsonNull },
      select: { id: true },
    });

    return { themeSettings: null };
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
