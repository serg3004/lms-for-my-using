import type { Prisma } from '@prisma/client';

import { getAncestorIdChain } from '../departments/public.js';

type TransactionClient = Prisma.TransactionClient;
type ManagerType = 'DIRECT' | 'FUNCTIONAL';

export type EffectiveDepartmentManager = {
  id: string;
  type: ManagerType;
  userId: string;
  isPrimary: boolean;
  source: 'LOCAL' | 'INHERITED';
  sourceDepartmentId: string;
  effectiveFrom: Date;
};

/** DP-internal shape: `sourceDepartmentId` is the true origin (fixed once set as LOCAL) --
 *  `source` is relative to whichever department is asking, so it is derived at the end. */
type PendingManager = Omit<EffectiveDepartmentManager, 'source'>;

const MANAGER_TYPES: ManagerType[] = ['DIRECT', 'FUNCTIONAL'];

/**
 * Computes the effective manager set for `departmentId` per the plan's LOCAL/INHERIT/MERGE
 * rules. Processes the ancestor chain root-first (a straight line, so `chain[i - 1]` is
 * always `chain[i]`'s parent -- no separate parentId lookup needed) so each department's
 * result is available before its children need it as their "nearest effective ancestor".
 * INHERIT reuses the parent's effective set as-is: if the parent's own effective set is
 * itself empty (whether LOCAL-with-no-managers or INHERIT-with-nothing-further-up), that
 * correctly propagates as "no effective ancestor found" without a separate upward search.
 * `sourceDepartmentId` is fixed at the department where a manager is truly LOCAL and never
 * changes as it propagates down the chain; `source` (LOCAL vs INHERITED) is only meaningful
 * relative to the department being queried, so it is derived once at the end rather than
 * carried through the DP.
 */
export async function computeEffectiveDepartmentManagers(
  client: TransactionClient,
  departmentId: string,
  organizationId: string,
): Promise<EffectiveDepartmentManager[]> {
  const chain = await getAncestorIdChain(client, departmentId, organizationId);

  const departments = await client.department.findMany({
    where: { id: { in: chain }, organizationId },
    select: { id: true, directManagerMode: true, functionalManagerMode: true },
  });
  const departmentById = new Map(departments.map((department) => [department.id, department]));

  const localManagers = await client.departmentManager.findMany({
    where: { organizationId, departmentId: { in: chain }, effectiveTo: null },
    select: { id: true, departmentId: true, userId: true, type: true, isPrimary: true, effectiveFrom: true },
  });
  const localByKey = new Map<string, typeof localManagers>();
  for (const manager of localManagers) {
    const key = `${manager.departmentId}:${manager.type}`;
    const list = localByKey.get(key) ?? [];
    list.push(manager);
    localByKey.set(key, list);
  }

  const effectiveByKey = new Map<string, PendingManager[]>();

  chain.forEach((id, index) => {
    const department = departmentById.get(id);
    if (!department) return;
    const parentId = index > 0 ? chain[index - 1] : null;

    for (const type of MANAGER_TYPES) {
      const mode = type === 'DIRECT' ? department.directManagerMode : department.functionalManagerMode;
      const local = localByKey.get(`${id}:${type}`) ?? [];
      const localEffective: PendingManager[] = local.map((manager) => ({
        id: manager.id,
        type,
        userId: manager.userId,
        isPrimary: manager.isPrimary,
        sourceDepartmentId: id,
        effectiveFrom: manager.effectiveFrom,
      }));

      let effective: PendingManager[];
      if (mode === 'LOCAL') {
        effective = localEffective;
      } else if (mode === 'INHERIT') {
        effective = parentId ? (effectiveByKey.get(`${parentId}:${type}`) ?? []) : [];
      } else {
        const inherited = parentId ? (effectiveByKey.get(`${parentId}:${type}`) ?? []) : [];
        const localUserIds = new Set(localEffective.map((manager) => manager.userId));
        const localHasPrimary = localEffective.some((manager) => manager.isPrimary);
        const dedupedInherited = inherited
          .filter((manager) => !localUserIds.has(manager.userId))
          .map((manager) => (localHasPrimary ? { ...manager, isPrimary: false } : manager));
        effective = [...localEffective, ...dedupedInherited];
      }

      effectiveByKey.set(`${id}:${type}`, effective);
    }
  });

  const result = [
    ...(effectiveByKey.get(`${departmentId}:DIRECT`) ?? []),
    ...(effectiveByKey.get(`${departmentId}:FUNCTIONAL`) ?? []),
  ];

  return result.map((manager) => ({
    ...manager,
    source: manager.sourceDepartmentId === departmentId ? 'LOCAL' : 'INHERITED',
  }));
}
