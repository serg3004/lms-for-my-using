/** PR 576: opening a folder to employees by name, shared by the sections that do it (tests, courses, assignments, materials). */

import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { z } from 'zod';

type Db = Pick<PrismaClient, 'user'>;

/** Staff who may see a folder when it is opened to them; learners never see folders. */
export const SHAREABLE_ROLES = ['admin', 'manager', 'instructor', 'mentor'] as const;
export const FOLDER_ACCESS_ROLES = ['manager', 'instructor', 'mentor'] as const;

export const folderSharedUserIdsSchema = z.array(z.guid()).max(100).transform((ids) => [...new Set(ids)]);
export const folderAccessRolesInput = z.array(z.enum(FOLDER_ACCESS_ROLES)).max(FOLDER_ACCESS_ROLES.length).transform((roles) => [...new Set(roles)]);

const displayName = (user: { firstName: string; lastName: string }) => `${user.lastName} ${user.firstName}`.trim();

export async function folderShareCandidates(db: Db, organizationId: string, search: string | undefined) {
  const term = search?.trim();
  const users = await db.user.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: 'active',
      memberships: { some: { organizationId, role: { in: [...SHAREABLE_ROLES] } } },
      ...(term ? { OR: [{ firstName: { contains: term, mode: 'insensitive' } }, { lastName: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }] } : {}),
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 30,
  });
  return users.map((user) => ({ id: user.id, name: displayName(user) }));
}

export async function folderSharedUsers(db: Db, organizationId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  const users = await db.user.findMany({ where: { organizationId, id: { in: [...ids] } }, select: { id: true, firstName: true, lastName: true } });
  return users.map((user) => ({ id: user.id, name: displayName(user) }));
}

/** Every newly named employee must be an active member of this organization with a staff role (those already on the list stay). */
export async function assertFolderShareable(db: Db, organizationId: string, ids: readonly string[], already: readonly string[] = []) {
  const fresh = ids.filter((id) => !already.includes(id));
  if (fresh.length === 0) return;
  const found = await db.user.count({
    where: { id: { in: fresh }, organizationId, deletedAt: null, status: 'active', memberships: { some: { organizationId, role: { in: [...SHAREABLE_ROLES] } } } },
  });
  if (found !== fresh.length) throw new BadRequestException('A folder can be opened only to active staff of the organization');
}
