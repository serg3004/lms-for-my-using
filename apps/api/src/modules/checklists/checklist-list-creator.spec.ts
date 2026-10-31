import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { ChecklistsService } from './checklists.service.js';

describe('ChecklistsService.listChecklists (PR 393)', () => {
  it('asks for the creator name so the list can show who created each sheet', async () => {
    const findMany = jest.fn(async (_args: unknown) => []);
    const prisma = { checklist: { findMany } } as unknown as PrismaService;
    const service = new ChecklistsService(prisma, {} as never, {} as never, {} as never);

    await service.listChecklists('org-1');

    const args = findMany.mock.calls[0]?.[0] as { select: { creator: unknown; createdAt: unknown }; orderBy: unknown };
    expect(args.select.creator).toEqual({ select: { id: true, firstName: true, lastName: true } });
    expect(args.select.createdAt).toBe(true);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });
});
