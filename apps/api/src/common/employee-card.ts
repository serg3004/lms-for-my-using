import type { PrismaService } from '../database/prisma.service.js';

/**
 * PR 507: the blocks of the employee card that a person who scans a badge may see. The administrator chooses which of the
 * four every signed-in user of the organization sees; the other facts (scores, contacts) need rights, see `employee-card.ts`.
 */
export const cardBlocks = ['courses', 'certificates', 'checklists', 'clearance'] as const;
export type CardBlock = (typeof cardBlocks)[number];
/** What an outside inspector may be shown beside the blocks: the full name is always shown. */
export const inspectorFields = ['photo', 'position', 'department', 'employeeNumber'] as const;
export type InspectorField = (typeof inspectorFields)[number];
export const inspectorVisible = [...inspectorFields, ...cardBlocks] as const;
export type InspectorVisible = (typeof inspectorVisible)[number];
/** An outside inspector sees these when the administrator does not choose. */
export const inspectorDefaultVisible: readonly InspectorVisible[] = ['photo', 'clearance'];

export const defaultCardBlocks: readonly CardBlock[] = cardBlocks;

export async function loadEmployeeCardBlocks(prisma: Pick<PrismaService, 'organization'>, organizationId: string): Promise<CardBlock[]> {
  const organization = await prisma.organization.findFirst({ where: { id: organizationId }, select: { employeeCardBlocks: true } });
  const stored = organization?.employeeCardBlocks ?? [...defaultCardBlocks];
  return cardBlocks.filter((block) => stored.includes(block));
}
