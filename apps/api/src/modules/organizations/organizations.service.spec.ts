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

function createPrismaMock() {
  return {
    organization: {
      findMany: jest.fn<() => Promise<unknown>>(),
      findFirst: jest.fn<() => Promise<unknown>>(),
      findUnique: jest.fn<() => Promise<unknown>>(),
      create: jest.fn<() => Promise<unknown>>(),
    },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

describe('OrganizationsService', () => {
  it('lists active organizations', async () => {
    const prisma: PrismaMock = createPrismaMock();
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
    const prisma: PrismaMock = createPrismaMock();
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
    const prisma: PrismaMock = createPrismaMock();
    prisma.organization.findFirst.mockResolvedValue(null);

    const service = new OrganizationsService(prisma as never);

    await expect(service.getOrganization(organization.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
