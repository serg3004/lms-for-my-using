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

/**
 * Direct headcount (plan invariant): current (effectiveTo IS NULL), active User, primary
 * membership, exactly this Department. Additional (non-primary) memberships and
 * inactive/historical rows are excluded. Batched over `departmentIds` in one GROUP BY query
 * regardless of how many departments are asked for -- callers must never loop this per node.
 */
export async function getDirectHeadcounts(
  client: TransactionClient,
  departmentIds: string[],
  organizationId: string,
): Promise<Map<string, number>> {
  if (departmentIds.length === 0) return new Map();

  const rows = await client.$queryRaw<{ id: string; count: bigint }[]>`
    SELECT dm.department_id AS id, COUNT(DISTINCT dm.user_id) AS count
    FROM department_memberships dm
    JOIN users u ON u.id = dm.user_id
    WHERE dm.organization_id = ${organizationId}::uuid
      AND dm.department_id = ANY(${departmentIds}::uuid[])
      AND dm.effective_to IS NULL
      AND dm.is_primary = true
      AND u.status = 'active'
    GROUP BY dm.department_id
  `;
  return new Map(rows.map((row) => [row.id, Number(row.count)]));
}

/**
 * Subtree headcount (plan invariant): unique Users with a current, active, primary membership
 * in the Department or any of its descendants. One recursive CTE covers every requested root
 * in a single query -- the roots need not be disjoint (an ancestor and its own descendant can
 * both appear in `departmentIds`), each still gets its own correct total.
 */
export async function getSubtreeHeadcounts(
  client: TransactionClient,
  departmentIds: string[],
  organizationId: string,
): Promise<Map<string, number>> {
  if (departmentIds.length === 0) return new Map();

  const rows = await client.$queryRaw<{ id: string; count: bigint }[]>`
    WITH RECURSIVE subtree AS (
      SELECT id AS root_id, id AS node_id, 0 AS lvl
      FROM departments
      WHERE organization_id = ${organizationId}::uuid AND id = ANY(${departmentIds}::uuid[])
      UNION ALL
      SELECT s.root_id, d.id, s.lvl + 1
      FROM departments d
      JOIN subtree s ON d.parent_id = s.node_id AND d.organization_id = ${organizationId}::uuid
      WHERE s.lvl < ${CTE_DEPTH_GUARD}
    )
    SELECT s.root_id AS id, COUNT(DISTINCT dm.user_id) AS count
    FROM subtree s
    JOIN department_memberships dm
      ON dm.department_id = s.node_id
      AND dm.organization_id = ${organizationId}::uuid
      AND dm.effective_to IS NULL
      AND dm.is_primary = true
    JOIN users u ON u.id = dm.user_id AND u.status = 'active'
    GROUP BY s.root_id
  `;
  return new Map(rows.map((row) => [row.id, Number(row.count)]));
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
