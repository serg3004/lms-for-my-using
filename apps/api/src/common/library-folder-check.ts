import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * PR 581: an item may be put only into a live folder of its own section and organization. The database ties an item to a
 * folder of its organization; the section is checked here. `null` and `undefined` (no folder) always pass.
 */
export async function assertLibraryFolder(db: Pick<Prisma.TransactionClient, 'libraryFolder'>, organizationId: string, scope: 'course' | 'assignment' | 'material', folderId: string | null | undefined) {
  if (!folderId) return;
  const folder = await db.libraryFolder.findFirst({ where: { id: folderId, organizationId, scope, deletedAt: null }, select: { id: true } });
  if (!folder) throw new NotFoundException('Folder not found');
}
