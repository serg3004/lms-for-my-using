import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { Prisma, PrismaClient } from '@prisma/client';

import { assertSafeTestDatabase } from '../integration/database-test-safety.js';
import { DepartmentsService } from '../modules/departments/departments.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/organization-access-scope.service.js';
import { LearningTargetResolverService } from '../modules/learning-targets/learning-target-resolver.service.js';
import { ReportsService } from '../modules/reports/reports.service.js';
import { ReportingLinesService } from '../modules/reporting-lines/reporting-lines.service.js';
import { OrgStructureAdminService } from '../modules/org-structure-admin/org-structure-admin.service.js';
import { ManagerTeamScope } from '../modules/manager-team-scope/manager-team-scope.js';
import type { TeamScopeActor } from '../modules/manager-team-scope/manager-team-scope.js';

/**
 * PR 281 -- performance verification for the org-structure adjacency-list + recursive-CTE
 * design. Seeds a representative dataset directly against a disposable local Postgres (bulk
 * `createMany`, never through the write services -- setup speed is not what this measures),
 * then benchmarks every read path named in the plan through the REAL service classes, records
 * EXPLAIN (ANALYZE, BUFFERS) for the underlying critical SQL, and checks for N+1 query growth.
 * Never run against anything but a local, disposable "*test*" database -- see
 * `assertSafeTestDatabase`. Always cleans up everything it created, even on failure.
 */

const TENANTS = [
  { label: 'tenant-a-large', departments: 850, users: 8500, memberships: 10200, roots: 5, wideChildren: 250 },
  { label: 'tenant-b-small', departments: 150, users: 1500, memberships: 1800, roots: 3, wideChildren: 60 },
] as const;

const SPINE_DEPTH = 10; // satisfies the plan's "depth >= 8" requirement with margin
const CHUNK = 1000;
const WARM_ITERATIONS = 20;
const WARMUP_ITERATIONS = 3;
const CSV_BENCH_ROWS = 10_000;

type PrismaServiceType = import('../database/prisma.service.js').PrismaService;
/** The services under benchmark only ever call Prisma methods (never Nest lifecycle hooks),
 * so a plain PrismaClient connected directly to the disposable database is a safe stand-in. */
const asService = (client: PrismaClient): PrismaServiceType => client as unknown as PrismaServiceType;

type DeptRow = { id: string; organizationId: string; parentId: string | null; name: string; code: string | null; sortOrder: number };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function createManyChunked<T>(label: string, items: T[], write: (batch: T[]) => Promise<unknown>) {
  for (const batch of chunk(items, CHUNK)) await write(batch);
  console.log(`  seeded ${items.length} ${label}`);
}

/** Builds an in-memory department tree: N roots, one deep spine under root[0], one wide
 * sibling layer under root[1], remaining nodes attached to a uniformly random existing node. */
function buildDepartmentTree(organizationId: string, tenantLabel: string, count: number, roots: number, wideChildren: number) {
  const rows: DeptRow[] = [];
  const push = (parentId: string | null, name: string, code: string | null): string => {
    const id = randomUUID();
    rows.push({ id, organizationId, parentId, name, code, sortOrder: rows.length });
    return id;
  };

  const rootIds: string[] = [];
  for (let r = 0; r < roots; r += 1) rootIds.push(push(null, `${tenantLabel} Root ${r}`, null));

  // Deep spine under root[0] -- depth 1 (root) + (SPINE_DEPTH - 1) more levels.
  let spineCursor = rootIds[0]!;
  for (let d = 1; d < SPINE_DEPTH; d += 1) spineCursor = push(spineCursor, `${tenantLabel} Spine L${d}`, null);
  const spineLeafId = spineCursor;

  // Wide sibling layer under root[1].
  const wideParentId = rootIds[1] ?? rootIds[0]!;
  const wideChildIds: string[] = [];
  for (let w = 0; w < wideChildren; w += 1) wideChildIds.push(push(wideParentId, `${tenantLabel} Wide ${w}`, null));

  // Remaining nodes: attach to a uniformly random already-created node (roots, spine, or wide layer).
  while (rows.length < count) {
    const parent = rows[Math.floor(Math.random() * rows.length)]!;
    push(parent.id, `${tenantLabel} Node ${rows.length}`, null);
  }

  return { rows: rows.slice(0, count), rootIds, spineLeafId, wideParentId, wideChildIds };
}

type SeededTenant = {
  organizationId: string;
  label: string;
  spineLeafId: string;
  wideParentId: string;
  rootIds: string[];
  wideChildIds: string[];
  searchDepartmentId: string;
  searchTerm: string;
  bigScopeActor: TeamScopeActor;
  chainTopActor: TeamScopeActor;
  sampleUserWithAssignment: { userId: string; courseId: string };
  csvBenchDepartmentCode: string;
  csvBenchUserIds: string[];
  courseId: string;
};

async function seedTenant(prisma: PrismaClient, config: (typeof TENANTS)[number]): Promise<SeededTenant> {
  const organization = await prisma.organization.create({
    data: { name: `Perf ${config.label} ${randomUUID().slice(0, 8)}`, slug: `perf-${config.label}-${randomUUID().slice(0, 8)}` },
  });
  const organizationId = organization.id;
  console.log(`Seeding ${config.label} (org ${organizationId})...`);

  const tree = buildDepartmentTree(organizationId, config.label, config.departments, config.roots, config.wideChildren);
  // Give one wide-layer child a stable, searchable name/code for the "search" and "path" benchmarks.
  const searchDepartmentId = tree.wideChildIds[0]!;
  const searchRow = tree.rows.find((row) => row.id === searchDepartmentId)!;
  searchRow.name = `${config.label} Findable Department`;
  searchRow.code = `FIND-${config.label}`;
  const csvBenchRow = tree.rows[tree.rows.length - 1]!;
  csvBenchRow.code = `CSVBENCH-${config.label}`;

  await createManyChunked('departments', tree.rows, (batch) =>
    prisma.department.createMany({ data: batch.map((row) => ({ id: row.id, organizationId, parentId: row.parentId, name: row.name, code: row.code, sortOrder: row.sortOrder })) }),
  );

  // Positions (small catalog; assigned to a fraction of memberships).
  const positionCount = 20;
  const positionIds = Array.from({ length: positionCount }, () => randomUUID());
  await prisma.position.createMany({
    data: positionIds.map((id, i) => ({ id, organizationId, code: `POS-${config.label}-${i}`, title: `Position ${i}` })),
  });

  // Users.
  const userIds = Array.from({ length: config.users }, () => randomUUID());
  await createManyChunked(
    'users',
    userIds,
    (batch) =>
      prisma.user.createMany({
        data: batch.map((id) => ({
          id,
          organizationId,
          email: `${id}@perf-bench.test`,
          passwordHash: 'not-used-by-this-benchmark',
          firstName: 'Perf',
          lastName: id.slice(0, 8),
        })),
      }),
  );

  // Primary memberships: one per user, weighted toward the spine + wide layer so headcount
  // aggregation there has real volume, remainder spread across all departments.
  // The CSV-bench department is deliberately excluded from regular membership assignment so it
  // starts with zero current memberships -- the CSV import benchmark below needs a CREATE_ONLY
  // target that is guaranteed empty for every user it imports.
  const departmentIds = tree.rows.map((row) => row.id).filter((id) => id !== csvBenchRow.id);
  const weightedDepartmentIds = [...departmentIds, ...Array(20).fill(tree.spineLeafId), ...tree.wideChildIds.flatMap((id) => Array(5).fill(id))];
  const pickDepartment = () => weightedDepartmentIds[Math.floor(Math.random() * weightedDepartmentIds.length)]!;

  const primaryDepartmentByUser = new Map<string, string>();
  const primaryMemberships = userIds.map((userId, i) => {
    const departmentId = pickDepartment();
    primaryDepartmentByUser.set(userId, departmentId);
    return {
      id: randomUUID(),
      organizationId,
      departmentId,
      userId,
      positionId: i % 3 === 0 ? positionIds[i % positionCount] : null,
      isPrimary: true,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    };
  });
  await createManyChunked('primary memberships', primaryMemberships, (batch) => prisma.departmentMembership.createMany({ data: batch }));

  // An additional (non-primary) membership must land in a DIFFERENT department than the same
  // user's current primary -- the partial unique index allows at most one current row per
  // (organization, user, department) regardless of isPrimary.
  const pickOtherDepartment = (excludeDepartmentId: string) => {
    let departmentId = pickDepartment();
    for (let attempt = 0; attempt < 10 && departmentId === excludeDepartmentId; attempt += 1) departmentId = pickDepartment();
    return departmentId;
  };
  const additionalCount = Math.max(0, config.memberships - config.users);
  const additionalMemberships = userIds.slice(0, additionalCount).map((userId) => ({
    id: randomUUID(),
    organizationId,
    departmentId: pickOtherDepartment(primaryDepartmentByUser.get(userId)!),
    userId,
    isPrimary: false,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  }));
  await createManyChunked('additional memberships', additionalMemberships, (batch) => prisma.departmentMembership.createMany({ data: batch }));

  // DepartmentManager: DIRECT manager on the wide-layer parent (for OrganizationAccessScope's
  // "big scope" actor) plus a scattering of DIRECT/FUNCTIONAL managers elsewhere. The partial
  // unique index allows at most one current manager per (department, type), so each candidate
  // department is used at most once per type -- shuffle-then-slice instead of random sampling
  // with replacement, which would collide once the department pool is smaller than the sample.
  const bigScopeManagerId = userIds[0]!;
  const managerRows: { id: string; organizationId: string; departmentId: string; userId: string; type: 'DIRECT' | 'FUNCTIONAL'; isPrimary: boolean }[] = [
    { id: randomUUID(), organizationId, departmentId: tree.wideParentId, userId: bigScopeManagerId, type: 'DIRECT', isPrimary: true },
  ];
  const managerCandidates = [...tree.rows.map((row) => row.id)].filter((id) => id !== tree.wideParentId).sort(() => Math.random() - 0.5);
  const managerSampleSize = Math.min(150, managerCandidates.length);
  for (let i = 0; i < managerSampleSize; i += 1) {
    managerRows.push({
      id: randomUUID(),
      organizationId,
      departmentId: managerCandidates[i]!,
      userId: userIds[(i + 1) % userIds.length]!,
      type: i % 2 === 0 ? 'DIRECT' : 'FUNCTIONAL',
      isPrimary: true,
    });
  }
  await createManyChunked('department managers', managerRows, (batch) => prisma.departmentManager.createMany({ data: batch }));

  // ReportingLine: one long DIRECT chain so directReportIds() has real transitive depth.
  const chainLength = Math.min(500, userIds.length - 1);
  const chainTopId = userIds[userIds.length - 1]!;
  const reportingLineRows = Array.from({ length: chainLength }, (_, i) => ({
    id: randomUUID(),
    organizationId,
    employeeId: userIds[userIds.length - 2 - i]!,
    managerId: i === 0 ? chainTopId : userIds[userIds.length - 1 - i]!,
    type: 'DIRECT' as const,
    isPrimary: true,
  }));
  await createManyChunked('reporting lines', reportingLineRows, (batch) => prisma.reportingLine.createMany({ data: batch }));

  // A course + department-scoped assignments (includeDescendants) targeting the spine root and
  // the wide layer, so LearningTargetResolver and reports have department-assignment volume.
  const course = await prisma.course.create({
    data: { organizationId, title: `${config.label} Course`, slug: `${config.label}-course-${randomUUID().slice(0, 8)}`, status: 'published' },
  });
  await prisma.assignment.createMany({
    data: [
      { organizationId, courseId: course.id, departmentId: tree.rootIds[0]!, includeDescendants: true, status: 'assigned' },
      { organizationId, courseId: course.id, departmentId: tree.wideParentId, includeDescendants: true, status: 'assigned' },
      { organizationId, courseId: course.id, userId: userIds[0]!, status: 'assigned' },
    ],
  });
  // Modest report-relevant volume (progress/certificates); PR 210 already covers pagination
  // at 1,000,000-row scale for these tables, so this benchmark only needs non-trivial volume
  // layered on top of the large org structure, not a second copy of that audit.
  const progressRows = userIds.slice(0, 2000).map((userId) => ({
    organizationId,
    courseId: course.id,
    userId,
    status: 'completed' as const,
    completedAt: new Date('2026-02-01T00:00:00Z'),
  }));
  await createManyChunked('progress rows', progressRows, (batch) => prisma.progress.createMany({ data: batch, skipDuplicates: true }));

  const sampleUserWithAssignment = { userId: userIds[0]!, courseId: course.id };

  return {
    organizationId,
    label: config.label,
    spineLeafId: tree.spineLeafId,
    wideParentId: tree.wideParentId,
    rootIds: tree.rootIds,
    wideChildIds: tree.wideChildIds,
    searchDepartmentId,
    searchTerm: 'Findable',
    bigScopeActor: { id: bigScopeManagerId, organizationId, roles: ['manager'] },
    chainTopActor: { id: chainTopId, organizationId, roles: ['manager'] },
    sampleUserWithAssignment,
    csvBenchDepartmentCode: csvBenchRow.code!,
    csvBenchUserIds: userIds.slice(0, CSV_BENCH_ROWS),
    courseId: course.id,
  };
}

type Timing = { label: string; p50: number; p95: number; max: number; thresholdMs: number; pass: boolean };

async function time(label: string, thresholdMs: number, iterations: number, fn: () => Promise<unknown>): Promise<Timing> {
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) await fn();
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length * 0.5)]!;
  const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))]!;
  const max = samples[samples.length - 1]!;
  return { label, p50, p95, max, thresholdMs, pass: p95 <= thresholdMs };
}

/** `client` must be constructed with `log: [{ emit: 'event', level: 'query' }]`. */
async function countQueries(client: PrismaClient<{ log: [{ emit: 'event'; level: 'query' }] }>, fn: () => Promise<unknown>): Promise<number> {
  let count = 0;
  const listener = () => {
    count += 1;
  };
  client.$on('query', listener);
  await fn();
  return count;
}

/**
 * There is no production "list the audience for a department-scoped assignment" query yet
 * (only per-user entitlement checks via LearningTargetResolverService) -- this reuses the same
 * recursive-subtree + current-primary-membership pattern as getSubtreeHeadcounts to measure
 * what that operation would cost, since the plan lists it as a distinct benchmarked operation.
 */
async function resolveAssignmentAudience(prisma: PrismaClient, organizationId: string, rootDepartmentId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ user_id: string }[]>`
    WITH RECURSIVE subtree AS (
      SELECT id FROM departments WHERE organization_id = ${organizationId}::uuid AND id = ${rootDepartmentId}::uuid
      UNION ALL
      SELECT d.id FROM departments d JOIN subtree s ON d.parent_id = s.id AND d.organization_id = ${organizationId}::uuid
    )
    SELECT DISTINCT dm.user_id
    FROM subtree s
    JOIN department_memberships dm ON dm.department_id = s.id AND dm.organization_id = ${organizationId}::uuid AND dm.effective_to IS NULL AND dm.is_primary = true
    JOIN users u ON u.id = dm.user_id AND u.status = 'active'
  `;
  return rows.map((row) => row.user_id);
}

async function explain(prisma: PrismaClient, label: string, sql: Prisma.Sql): Promise<{ label: string; plan: unknown }> {
  const rows = await prisma.$queryRaw<{ 'QUERY PLAN': unknown }[]>(sql);
  return { label, plan: rows[0]?.['QUERY PLAN'] };
}

async function runBenchmarks(prisma: PrismaClient, tenant: SeededTenant) {
  const departmentsService = new DepartmentsService(asService(prisma));
  const teamScope = new ManagerTeamScope();
  const scopeService = new OrganizationAccessScopeService(asService(prisma), teamScope);
  const learningTargetResolver = new LearningTargetResolverService(asService(prisma));
  const reportsService = new ReportsService(asService(prisma), teamScope, scopeService);
  const reportingLinesService = new ReportingLinesService(asService(prisma));
  const orgStructureAdmin = new OrgStructureAdminService(asService(prisma));

  const results: Timing[] = [];
  results.push(await time('roots', 300, WARM_ITERATIONS, () => departmentsService.getTree(tenant.organizationId)));
  results.push(await time('lazy children', 250, WARM_ITERATIONS, () => departmentsService.getChildren(tenant.wideParentId, tenant.organizationId)));
  results.push(
    await time('search', 400, WARM_ITERATIONS, () =>
      departmentsService.listDepartments(tenant.organizationId, { page: 1, pageSize: 25, search: tenant.searchTerm }),
    ),
  );
  results.push(await time('path', 250, WARM_ITERATIONS, () => departmentsService.getPath(tenant.spineLeafId, tenant.organizationId)));
  results.push(await time('direct+subtree headcount (via getDepartment)', 500, WARM_ITERATIONS, () => departmentsService.getDepartment(tenant.wideParentId, tenant.organizationId)));
  results.push(
    await time('effective manager resolution', 300, WARM_ITERATIONS, () =>
      reportingLinesService.getEffectiveManager(tenant.sampleUserWithAssignment.userId, tenant.organizationId),
    ),
  );
  results.push(await time('OrganizationAccessScope (big DIRECT-managed subtree)', 400, WARM_ITERATIONS, () => scopeService.user(tenant.bigScopeActor)));
  results.push(await time('OrganizationAccessScope (transitive DIRECT reporting-line chain)', 400, WARM_ITERATIONS, () => scopeService.directReportIds(tenant.chainTopActor)));
  results.push(
    await time('LearningTargetResolver (department assignment, includeDescendants)', 250, WARM_ITERATIONS, () =>
      learningTargetResolver.resolveForUser(tenant.organizationId, tenant.sampleUserWithAssignment.userId, tenant.sampleUserWithAssignment.courseId),
    ),
  );
  results.push(
    await time('Department assignment audience (resolved user ids for an includeDescendants assignment)', 1000, WARM_ITERATIONS, () =>
      resolveAssignmentAudience(prisma, tenant.organizationId, tenant.wideParentId),
    ),
  );
  results.push(await time('reports summary', 750, WARM_ITERATIONS, () => reportsService.getSummary(tenant.bigScopeActor, { departmentId: tenant.wideParentId, includeDescendants: true })));

  // CSV preview/commit at 10k rows -- one iteration each (these are one-shot admin operations,
  // not hot-path reads warmed 20x, and preview/commit are inherently sequential: commit
  // consumes the token preview produced).
  const csvRows = tenant.csvBenchUserIds.map((userId) => `${userId},${tenant.csvBenchDepartmentCode},ADDITIONAL,,`);
  const csv = Buffer.from(['userId,departmentCode,membershipType,positionCode,effectiveFrom', ...csvRows].join('\n') + '\n');
  const previewStart = performance.now();
  const preview = await orgStructureAdmin.preview(csv, 'MEMBERSHIPS', 'CREATE_ONLY', tenant.organizationId, tenant.bigScopeActor.id);
  const previewMs = performance.now() - previewStart;
  results.push({ label: `CSV preview (${CSV_BENCH_ROWS} rows)`, p50: previewMs, p95: previewMs, max: previewMs, thresholdMs: 10_000, pass: previewMs <= 10_000 });

  if (preview.valid && preview.token) {
    const commitStart = performance.now();
    await orgStructureAdmin.commit(preview.token, tenant.organizationId, tenant.bigScopeActor.id);
    const commitMs = performance.now() - commitStart;
    results.push({ label: `CSV commit (${CSV_BENCH_ROWS} rows)`, p50: commitMs, p95: commitMs, max: commitMs, thresholdMs: 20_000, pass: commitMs <= 20_000 });
  } else {
    console.error('CSV preview did not validate -- skipping commit benchmark', preview.errors?.slice(0, 5));
  }

  // N+1 spot-check: query count for a 25-row search page (with headcounts) must not scale
  // with the number of rows returned -- it must stay a small, constant number of queries.
  const queryCountingPrisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  const countingDepartmentsService = new DepartmentsService(asService(queryCountingPrisma));
  const queryCount = await countQueries(queryCountingPrisma, () =>
    countingDepartmentsService.listDepartments(tenant.organizationId, { page: 1, pageSize: 25, status: 'active' as const }),
  );
  await queryCountingPrisma.$disconnect();

  return { results, queryCountForPagedSearch: queryCount };
}

async function runExplain(prisma: PrismaClient, tenant: SeededTenant) {
  const org = tenant.organizationId;
  return [
    await explain(
      prisma,
      'subtree headcount CTE (wide layer parent)',
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        WITH RECURSIVE subtree AS (
          SELECT id AS root_id, id AS node_id, 0 AS lvl FROM departments WHERE organization_id = ${org}::uuid AND id = ${tenant.wideParentId}::uuid
          UNION ALL
          SELECT s.root_id, d.id, s.lvl + 1 FROM departments d JOIN subtree s ON d.parent_id = s.node_id AND d.organization_id = ${org}::uuid WHERE s.lvl < 40
        )
        SELECT s.root_id AS id, COUNT(DISTINCT dm.user_id) AS count
        FROM subtree s
        JOIN department_memberships dm ON dm.department_id = s.node_id AND dm.organization_id = ${org}::uuid AND dm.effective_to IS NULL AND dm.is_primary = true
        JOIN users u ON u.id = dm.user_id AND u.status = 'active'
        GROUP BY s.root_id`,
    ),
    await explain(
      prisma,
      'ancestor chain CTE (path, deep spine leaf)',
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        WITH RECURSIVE chain AS (
          SELECT id, parent_id, 0 AS lvl FROM departments WHERE id = ${tenant.spineLeafId}::uuid AND organization_id = ${org}::uuid
          UNION ALL
          SELECT p.id, p.parent_id, c.lvl + 1 FROM departments p JOIN chain c ON p.id = c.parent_id AND p.organization_id = ${org}::uuid WHERE c.lvl < 40
        )
        SELECT id, lvl FROM chain ORDER BY lvl DESC`,
    ),
    await explain(
      prisma,
      'subtree headcount CTE, BATCHED (all 5 roots -- matches getTree())',
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        WITH RECURSIVE subtree AS (
          SELECT id AS root_id, id AS node_id, 0 AS lvl FROM departments WHERE organization_id = ${org}::uuid AND id = ANY(${tenant.rootIds}::uuid[])
          UNION ALL
          SELECT s.root_id, d.id, s.lvl + 1 FROM departments d JOIN subtree s ON d.parent_id = s.node_id AND d.organization_id = ${org}::uuid WHERE s.lvl < 40
        )
        SELECT s.root_id AS id, COUNT(DISTINCT dm.user_id) AS count
        FROM subtree s
        JOIN department_memberships dm ON dm.department_id = s.node_id AND dm.organization_id = ${org}::uuid AND dm.effective_to IS NULL AND dm.is_primary = true
        JOIN users u ON u.id = dm.user_id AND u.status = 'active'
        GROUP BY s.root_id`,
    ),
    await explain(
      prisma,
      'subtree headcount CTE, BATCHED (250 wide-layer children -- matches getChildren())',
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        WITH RECURSIVE subtree AS (
          SELECT id AS root_id, id AS node_id, 0 AS lvl FROM departments WHERE organization_id = ${org}::uuid AND id = ANY(${tenant.wideChildIds}::uuid[])
          UNION ALL
          SELECT s.root_id, d.id, s.lvl + 1 FROM departments d JOIN subtree s ON d.parent_id = s.node_id AND d.organization_id = ${org}::uuid WHERE s.lvl < 40
        )
        SELECT s.root_id AS id, COUNT(DISTINCT dm.user_id) AS count
        FROM subtree s
        JOIN department_memberships dm ON dm.department_id = s.node_id AND dm.organization_id = ${org}::uuid AND dm.effective_to IS NULL AND dm.is_primary = true
        JOIN users u ON u.id = dm.user_id AND u.status = 'active'
        GROUP BY s.root_id`,
    ),
    await explain(
      prisma,
      'direct headcount (wide layer parent)',
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT dm.department_id AS id, COUNT(DISTINCT dm.user_id) AS count
        FROM department_memberships dm JOIN users u ON u.id = dm.user_id
        WHERE dm.organization_id = ${org}::uuid AND dm.department_id = ${tenant.wideParentId}::uuid AND dm.effective_to IS NULL AND dm.is_primary = true AND u.status = 'active'
        GROUP BY dm.department_id`,
    ),
    await explain(
      prisma,
      'department search (name/code ILIKE)',
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id FROM departments
        WHERE organization_id = ${org}::uuid AND (name ILIKE ${'%' + tenant.searchTerm + '%'} OR code ILIKE ${'%' + tenant.searchTerm + '%'})
        ORDER BY sort_order ASC LIMIT 25`,
    ),
  ];
}

async function cleanupTenant(prisma: PrismaClient, organizationId: string) {
  await prisma.orgStructureImportPreview.deleteMany({ where: { organizationId } });
  await prisma.orgStructureEvent.deleteMany({ where: { organizationId } });
  await prisma.progress.deleteMany({ where: { organizationId } });
  await prisma.assignment.deleteMany({ where: { organizationId } });
  await prisma.course.deleteMany({ where: { organizationId } });
  await prisma.reportingLine.deleteMany({ where: { organizationId } });
  await prisma.departmentManager.deleteMany({ where: { organizationId } });
  await prisma.departmentMembership.deleteMany({ where: { organizationId } });
  await prisma.position.deleteMany({ where: { organizationId } });
  await prisma.department.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
}

async function main() {
  const databaseUrl = assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const organizationIds: string[] = [];

  try {
    const report: Record<string, unknown> = { seededAt: new Date().toISOString(), tenants: [] };

    for (const config of TENANTS) {
      const tenant = await seedTenant(prisma, config);
      organizationIds.push(tenant.organizationId);

      // A production tenant accumulates rows gradually with autovacuum keeping planner
      // statistics fresh; a one-shot bulk seed does not. Without this, the very first queries
      // below can hit stale (pre-seed) statistics and get a materially worse plan than the
      // same query gets moments later once autoanalyze catches up -- a benchmark artifact of
      // this script's seeding shape, not a real adjacency/CTE cost under real usage.
      await prisma.$executeRawUnsafe('ANALYZE');

      console.log(`Benchmarking ${tenant.label}...`);
      const { results, queryCountForPagedSearch } = await runBenchmarks(prisma, tenant);
      const explainPlans = await runExplain(prisma, tenant);

      (report.tenants as unknown[]).push({
        label: tenant.label,
        timings: results,
        queryCountForPagedSearch,
        explainPlans,
      });

      console.log(`\n=== ${tenant.label} ===`);
      for (const r of results) {
        console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.label.padEnd(60)} p50=${r.p50.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms max=${r.max.toFixed(1)}ms (threshold ${r.thresholdMs}ms)`);
      }
      console.log(`  N+1 check: ${queryCountForPagedSearch} SQL queries for a 25-row paged search (must stay small/constant, not scale with row count)`);
    }

    console.log('\nFull report (JSON):');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    for (const organizationId of organizationIds) {
      await cleanupTenant(prisma, organizationId).catch((error: unknown) => {
        console.error(`Cleanup failed for ${organizationId}:`, error);
      });
    }
    await prisma.$disconnect();
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error('Performance benchmark failed:', error);
    process.exitCode = 1;
  });
}
