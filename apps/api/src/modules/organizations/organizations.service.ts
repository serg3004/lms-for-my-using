import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CreateOrganizationInput } from './organizations.schemas.js';

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  plan: true,
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
    const existingOrganization = await this.prisma.organization.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });

    if (existingOrganization) {
      throw new ConflictException('Organization slug already exists');
    }

    return this.prisma.organization.create({
      data: input,
      select: organizationSelect,
    });
  }
}
