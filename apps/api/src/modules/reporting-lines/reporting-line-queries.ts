import type { Prisma } from '@prisma/client';

/**
 * Mirrors department-tree-queries.ts's recursion-guard convention: DIRECT ReportingLine edges
 * form a graph, not necessarily a tree (an employee could in principle have multiple current
 * DIRECT managers via different rows, though `reporting_lines_current_primary_type_key` caps
 * primary ones at one), so this bounds recursion defensively rather than relying on a fixed
 * hierarchy depth.
 */
const CTE_DEPTH_GUARD = 40;

type TransactionClient = Prisma.TransactionClient;

/**
 * Every user id reachable from `managerId` by following current (effectiveTo IS NULL) DIRECT
 * ReportingLine edges downward -- i.e. direct reports, their direct reports, and so on. Used
 * both for OrganizationAccessScopeService's "direct and transitive DIRECT reports" manager
 * scope and, from the other direction (starting at the prospective employee), for cycle
 * detection before creating a new DIRECT edge.
 */
export async function getTransitiveDirectReportIds(
  client: TransactionClient,
  managerId: string,
  organizationId: string,
): Promise<string[]> {
  const rows = await client.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE reports AS (
      SELECT employee_id AS id, 0 AS lvl
      FROM reporting_lines
      WHERE organization_id = ${organizationId}::uuid
        AND manager_id = ${managerId}::uuid
        AND type = 'DIRECT'
        AND effective_to IS NULL
      UNION ALL
      SELECT rl.employee_id, r.lvl + 1
      FROM reporting_lines rl
      JOIN reports r ON rl.manager_id = r.id AND rl.organization_id = ${organizationId}::uuid
      WHERE rl.type = 'DIRECT' AND rl.effective_to IS NULL AND r.lvl < ${CTE_DEPTH_GUARD}
    )
    SELECT DISTINCT id FROM reports
  `;
  return rows.map((row) => row.id);
}

/**
 * True when adding a current DIRECT edge `employeeId -> managerId` (employee reports to
 * manager) would close a cycle in the existing DIRECT graph -- i.e. `managerId` is already,
 * directly or transitively, a report of `employeeId`.
 */
export async function wouldCreateDirectReportingCycle(
  client: TransactionClient,
  employeeId: string,
  managerId: string,
  organizationId: string,
): Promise<boolean> {
  const existingReportsOfEmployee = await getTransitiveDirectReportIds(client, employeeId, organizationId);
  return existingReportsOfEmployee.includes(managerId);
}
