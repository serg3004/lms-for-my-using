import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { ChecklistsService } from './checklists.service.js';

describe('ChecklistsService.listChecklists (PR 393)', () => {
  it('asks for the creator name so the list can show who created each sheet', async () => {
    const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>(async () => []);
    const prisma = { checklist: { findMany } } as unknown as PrismaService;
    const service = new ChecklistsService(prisma, {} as never, {} as never, {} as never);

    await service.listChecklists('org-1');

    const args = findMany.mock.calls[0]?.[0] as { select: { creator: unknown; createdAt: unknown }; orderBy: unknown };
    expect(args.select.creator).toEqual({ select: { id: true, firstName: true, lastName: true } });
    expect(args.select.createdAt).toBe(true);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });
  it('adds the live assignments count of each sheet for the library screen (PR 408)', async () => {
    const row = { id: 'c1', title: 'A', folderId: null, items: [], moduleSettings: undefined, _count: { instances: 3 } };
    const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>(async () => [row]);
    const prisma = { checklist: { findMany } } as unknown as PrismaService;
    const service = new ChecklistsService(prisma, {} as never, {} as never, {} as never);

    const rows = await service.listChecklists('org-1') as Array<Record<string, unknown>>;

    const args = findMany.mock.calls[0]?.[0] as { select: { _count: unknown } };
    expect(args.select._count).toEqual({ select: { instances: { where: { status: { in: ['assigned', 'in_progress', 'submitted'] }, deletedAt: null } } } });
    expect(rows[0]?.['assignmentCount']).toBe(3);
    expect(rows[0]).not.toHaveProperty('_count');
  });
});

it('PR 427 searches the visible title across marks without returning another title', async () => {
  const findMany = jest.fn(async () => [
    { id: 'one', title: '<strong>Safe</strong>ty', folderId: null, items: [], _count: { instances: 0 } },
    { id: 'two', title: 'Other', folderId: null, items: [], _count: { instances: 0 } },
  ]);
  const service = new ChecklistsService({ checklist: { findMany } } as unknown as PrismaService, {} as never, {} as never, {} as never);
  const rows = await service.listChecklists('org-1', 'draft', undefined, 'SAFETY');
  expect(rows.map((row) => row.id)).toEqual(['one']);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', deletedAt: null, status: 'draft' }) }));
});
