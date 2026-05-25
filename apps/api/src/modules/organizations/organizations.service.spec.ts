import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { OrganizationsService } from './organizations.service.js';

const now = new Date('2026-05-25T00:00:00.000Z');

const organization = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Acme Academy',
  slug: 'acme-academy',
  status: 'active',
  plan: 'trial',
  createdAt: now,
  updatedAt: now,
};

type PrismaMock = {
  organization: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    organization: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
}

describe('OrganizationsService', () => {
  it('lists active organizations', async () => {
    const prisma = createPrismaMock();
    prisma.organization.findMany.mockResolvedValue([organization]);

    const service = new OrganizationsService(prisma as never);

    await expect(service.listOrganizations()).resolves.toEqual([organization]);
    expect(prisma.organization.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: expect.objectContaining({ id: true, slug: true }),
    });
  });

  it('rejects duplicate organization slug', async () => {
    const prisma = createPrismaMock();
    prisma.organization.findUnique.mockResolvedValue({ id: organization.id });

    const service = new OrganizationsService(prisma as never);

    await expect(
      service.createOrganization({
        name: organization.name,
        slug: organization.slug,
        status: 'active',
        plan: 'trial',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws when organization is not found', async () => {
    const prisma = createPrismaMock();
    prisma.organization.findFirst.mockResolvedValue(null);

    const service = new OrganizationsService(prisma as never);

    await expect(service.getOrganization(organization.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
