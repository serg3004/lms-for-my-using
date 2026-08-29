import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { unrestrictedActor } from '../manager-team-scope/manager-team-scope.js';
import { UsersService } from './users.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';

describe('UsersService.listUsers search (PR 267: server-side user search for pickers)', () => {
  it('lists users without a search filter when none is provided', async () => {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const prisma = { user: { findMany, count } } as unknown as PrismaService;
    const service = new UsersService(prisma);

    await service.listUsers(unrestrictedActor(organizationId), 1, 20);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId, deletedAt: null },
      }),
    );
  });

  it('filters by case-insensitive first name, last name, or email when a search term is given', async () => {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const prisma = { user: { findMany, count } } as unknown as PrismaService;
    const service = new UsersService(prisma);

    await service.listUsers(unrestrictedActor(organizationId), 1, 20, 'ada');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId,
          deletedAt: null,
          OR: [
            { firstName: { contains: 'ada', mode: 'insensitive' } },
            { lastName: { contains: 'ada', mode: 'insensitive' } },
            { email: { contains: 'ada', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('applies the same search filter to the count query so total matches the filtered results', async () => {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const prisma = { user: { findMany, count } } as unknown as PrismaService;
    const service = new UsersService(prisma);

    await service.listUsers(unrestrictedActor(organizationId), 1, 20, 'lovelace');

    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ email: { contains: 'lovelace', mode: 'insensitive' } }]),
        }),
      }),
    );
  });
});
