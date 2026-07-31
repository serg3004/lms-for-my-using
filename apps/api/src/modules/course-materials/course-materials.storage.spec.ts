import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { CourseMaterialsService } from './course-materials.service.js';

describe('CourseMaterialsService tenant-aware storage', () => {
  it('always scopes storage lookup by material and organization', async () => {
    const findFirst = jest.fn(async () => null);
    const service = new CourseMaterialsService({ courseMaterial: { findFirst } } as unknown as PrismaService);

    await expect(service.getMaterialStorageReference('material-a', 'organization-a')).rejects.toThrow(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'material-a', organizationId: 'organization-a', deletedAt: null },
      }),
    );
  });

  it('does not expose a cross-tenant material reference', async () => {
    const service = new CourseMaterialsService({
      courseMaterial: {
        findFirst: async ({ where }: { where: { organizationId: string } }) =>
          where.organizationId === 'organization-owner'
            ? { id: 'material-a', kind: 'file', fileUrl: null, objectKey: 'organizations/organization-owner/materials/material-a/object' }
            : null,
      },
    } as unknown as PrismaService);

    await expect(service.getMaterialStorageReference('material-a', 'organization-attacker')).rejects.toThrow(
      NotFoundException,
    );
  });
});
