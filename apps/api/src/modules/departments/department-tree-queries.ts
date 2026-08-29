import type { Prisma } from '@prisma/client';

/**
 * Plan invariant: hierarchy is an adjacency list via Department.parentId, traversed with
 * PostgreSQL recursive CTEs (closure table/ltree are out of scope until a measured
 * bottleneck). Every CTE below bounds recursion defensively at 40 levels — comfortably
 * above the enforced MAX_DEPARTMENT_DEPTH (32) — so a data anomaly can never spin the
 * database into an unbounded recursive scan.
 */
const CTE_DEPTH_GUARD = 40;

type TransactionClient = Prisma.TransactionClient;

/** 1-indexed depth of a department (a root has depth 1). */
export async function getDepartmentDepth(
  client: TransactionClient,
  departmentId: string,
  organizationId: string,
): Promise<number> {
  const rows = await client.$queryRaw<{ lvl: number }[]>`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 0 AS lvl
      FROM departments
      WHERE id = ${departmentId}::uuid AND organization_id = ${organizationId}::uuid
      UNION ALL
      SELECT p.id, p.parent_id, c.lvl + 1
      FROM departments p
      JOIN chain c ON p.id = c.parent_id AND p.organization_id = ${organizationId}::uuid
      WHERE c.lvl < ${CTE_DEPTH_GUARD}
    )
    SELECT max(lvl) AS lvl FROM chain
  `;
  const maxLvl = rows[0]?.lvl;
  return maxLvl === null || maxLvl === undefined ? 0 : Number(maxLvl) + 1;
}

/** Number of levels below a department to its deepest descendant (0 for a leaf). */
export async function getSubtreeHeight(
  client: TransactionClient,
  departmentId: string,
  organizationId: string,
): Promise<number> {
  const rows = await client.$queryRaw<{ lvl: number }[]>`
    WITH RECURSIVE subtree AS (
      SELECT id, 0 AS lvl
      FROM departments
      WHERE id = ${departmentId}::uuid AND organization_id = ${organizationId}::uuid
      UNION ALL
      SELECT c.id, s.lvl + 1
      FROM departments c
      JOIN subtree s ON c.parent_id = s.id AND c.organization_id = ${organizationId}::uuid
      WHERE s.lvl < ${CTE_DEPTH_GUARD}
    )
    SELECT max(lvl) AS lvl FROM subtree
  `;
  const maxLvl = rows[0]?.lvl;
  return maxLvl === null || maxLvl === undefined ? 0 : Number(maxLvl);
}

/** True when `candidateId` is `departmentId` itself or one of its descendants. */
export async function isSelfOrDescendant(
  client: TransactionClient,
  departmentId: string,
  candidateId: string,
  organizationId: string,
): Promise<boolean> {
  if (departmentId === candidateId) return true;

  const rows = await client.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE subtree AS (
      SELECT id, 0 AS lvl
      FROM departments
      WHERE id = ${departmentId}::uuid AND organization_id = ${organizationId}::uuid
      UNION ALL
      SELECT c.id, s.lvl + 1
      FROM departments c
      JOIN subtree s ON c.parent_id = s.id AND c.organization_id = ${organizationId}::uuid
      WHERE s.lvl < ${CTE_DEPTH_GUARD}
    )
    SELECT id FROM subtree WHERE id = ${candidateId}::uuid LIMIT 1
  `;
  return rows.length > 0;
}

/** Ancestor chain root-first, including the department itself as the last entry. */
export async function getAncestorIdChain(
  client: TransactionClient,
  departmentId: string,
  organizationId: string,
): Promise<string[]> {
  const rows = await client.$queryRaw<{ id: string; lvl: number }[]>`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 0 AS lvl
      FROM departments
      WHERE id = ${departmentId}::uuid AND organization_id = ${organizationId}::uuid
      UNION ALL
      SELECT p.id, p.parent_id, c.lvl + 1
      FROM departments p
      JOIN chain c ON p.id = c.parent_id AND p.organization_id = ${organizationId}::uuid
      WHERE c.lvl < ${CTE_DEPTH_GUARD}
    )
    SELECT id, lvl FROM chain ORDER BY lvl DESC
  `;
  return rows.map((row) => row.id);
}
