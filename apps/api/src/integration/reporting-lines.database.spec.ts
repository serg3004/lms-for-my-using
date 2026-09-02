/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { DepartmentManagersService } from '../modules/department-managers/department-managers.service.js';
import { DepartmentMembershipsService } from '../modules/department-memberships/department-memberships.service.js';
import { DepartmentsService } from '../modules/departments/departments.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import { ReportingLinesService } from '../modules/reporting-lines/reporting-lines.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

type PrismaServiceType = import('../database/prisma.service.js').PrismaService;

/**
 * PR 279 exercises ReportingLine against real Postgres: the DB CHECK/partial-unique
 * invariants, DIRECT cycle rejection (including a genuine concurrent race), the
 * effective-manager fallback chain (personal ReportingLine -> Department manager -> null),
 * and OrganizationAccessScopeService's third union branch (direct and transitive DIRECT
 * reports, gated on RBAC manager, never extended by FUNCTIONAL/PROJECT).
 */
describe('reporting lines (database)', () => {
  const prisma = new PrismaClient();
  const typedPrisma = prisma as unknown as PrismaServiceType;
  const departmentsService = new DepartmentsService(typedPrisma);
  const membershipsService = new DepartmentMembershipsService(typedPrisma);
  const departmentManagersService = new DepartmentManagersService(typedPrisma);
  const reportingLinesService = new ReportingLinesService(typedPrisma);
  const scopeService = new OrganizationAccessScopeService(typedPrisma);
  const organizationIds: string[] = [];

  beforeAll(() => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
  });

  afterAll(async () => {
    await prisma.reportingLine.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.departmentManager.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.orgStructureEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.departmentMembership.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.department.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  async function createOrganization(label: string) {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Reporting lines ${label} ${suffix}`, slug: `reporting-lines-${label}-${suffix}` },
    });
    organizationIds.push(organization.id);
    return organization;
  }

  async function createUser(organizationId: string, label: string) {
    return prisma.user.create({
      data: {
        organizationId,
        email: `${label}-${randomUUID()}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Test',
        lastName: label,
      },
    });
  }

  it('rejects self-management at the database level', async () => {
    const organization = await createOrganization('self');
    const user = await createUser(organization.id, 'Solo');

    await expect(
      prisma.$executeRaw`INSERT INTO "reporting_lines" ("id", "organization_id", "employee_id", "manager_id", "type", "created_at", "updated_at")
        VALUES (gen_random_uuid(), ${organization.id}::uuid, ${user.id}::uuid, ${user.id}::uuid, 'DIRECT', now(), now())`,
    ).rejects.toThrow();
  });

  it('rejects a duplicate current (employee, manager, type) line and a second current primary of the same type', async () => {
    const organization = await createOrganization('dup');
    const employee = await createUser(organization.id, 'Employee');
    const managerA = await createUser(organization.id, 'ManagerA');
    const managerB = await createUser(organization.id, 'ManagerB');

    await reportingLinesService.createReportingLine(
      { organizationId: organization.id, employeeId: employee.id, managerId: managerA.id, type: 'DIRECT', isPrimary: true },
      null,
    );

    await expect(
      reportingLinesService.createReportingLine(
        { organizationId: organization.id, employeeId: employee.id, managerId: managerA.id, type: 'DIRECT', isPrimary: false },
        null,
      ),
    ).rejects.toMatchObject({ status: 409 });

    // A second current DIRECT line to a *different* manager is allowed (matrix org), but it
    // cannot also be primary while managerA's line is still the current primary.
    await expect(
      reportingLinesService.createReportingLine(
        { organizationId: organization.id, employeeId: employee.id, managerId: managerB.id, type: 'DIRECT', isPrimary: true },
        null,
      ),
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      reportingLinesService.createReportingLine(
        { organizationId: organization.id, employeeId: employee.id, managerId: managerB.id, type: 'DIRECT', isPrimary: false },
        null,
      ),
    ).resolves.toMatchObject({ isPrimary: false });
  });

  it('stores FUNCTIONAL and PROJECT relations separately from DIRECT, with no cycle check applied', async () => {
    const organization = await createOrganization('types');
    const employee = await createUser(organization.id, 'Employee');
    const functionalManager = await createUser(organization.id, 'FunctionalManager');
    const projectManager = await createUser(organization.id, 'ProjectManager');

    const functional = await reportingLinesService.createReportingLine(
      { organizationId: organization.id, employeeId: employee.id, managerId: functionalManager.id, type: 'FUNCTIONAL', isPrimary: true },
      null,
    );
    const project = await reportingLinesService.createReportingLine(
      { organizationId: organization.id, employeeId: employee.id, managerId: projectManager.id, type: 'PROJECT', isPrimary: true },
      null,
    );

    expect(functional.type).toBe('FUNCTIONAL');
    expect(project.type).toBe('PROJECT');

    const history = await reportingLinesService.listForUser(employee.id, organization.id);
    expect(history.map((line) => line.type).sort()).toEqual(['FUNCTIONAL', 'PROJECT']);
  });

  it('rejects a DIRECT edge that would close a cycle in the manager hierarchy', async () => {
    const organization = await createOrganization('cycle');
    const a = await createUser(organization.id, 'A');
    const b = await createUser(organization.id, 'B');
    const c = await createUser(organization.id, 'C');

    // A reports to B, B reports to C.
    await reportingLinesService.createReportingLine({ organizationId: organization.id, employeeId: a.id, managerId: b.id, type: 'DIRECT', isPrimary: true }, null);
    await reportingLinesService.createReportingLine({ organizationId: organization.id, employeeId: b.id, managerId: c.id, type: 'DIRECT', isPrimary: true }, null);

    // C reporting to A would close the loop A -> B -> C -> A.
    await expect(
      reportingLinesService.createReportingLine({ organizationId: organization.id, employeeId: c.id, managerId: a.id, type: 'DIRECT', isPrimary: true }, null),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('never lets two concurrent DIRECT creates that together would form a cycle both commit', async () => {
    const organization = await createOrganization('concurrent-cycle');
    const a = await createUser(organization.id, 'A');
    const b = await createUser(organization.id, 'B');
    const c = await createUser(organization.id, 'C');

    // Existing edge: A reports to B. Concurrently: B -> C and C -> A. If both commit, the
    // chain A -> B -> C -> A is a cycle -- at most one may succeed.
    await reportingLinesService.createReportingLine({ organizationId: organization.id, employeeId: a.id, managerId: b.id, type: 'DIRECT', isPrimary: true }, null);

    const results = await Promise.allSettled([
      reportingLinesService.createReportingLine({ organizationId: organization.id, employeeId: b.id, managerId: c.id, type: 'DIRECT', isPrimary: true }, null),
      reportingLinesService.createReportingLine({ organizationId: organization.id, employeeId: c.id, managerId: a.id, type: 'DIRECT', isPrimary: true }, null),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // No cycle exists afterward: A's transitive reports never loop back to A.
    const aScope = await scopeService.directReportIds({ id: a.id, organizationId: organization.id, roles: ['manager'] });
    expect(aScope).not.toContain(a.id);
  });

  it('effective manager: personal DIRECT primary wins, then falls back to the Department primary DIRECT manager, then null', async () => {
    const organization = await createOrganization('effective');
    const department = await departmentsService.createDepartment(
      { organizationId: organization.id, name: 'Dept', sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
    const employee = await createUser(organization.id, 'Employee');
    const departmentManager = await createUser(organization.id, 'DeptManager');
    const personalManager = await createUser(organization.id, 'PersonalManager');

    const noManager = await reportingLinesService.getEffectiveManager(employee.id, organization.id);
    expect(noManager).toEqual({ managerId: null, source: null });

    await membershipsService.createMembership({ organizationId: organization.id, departmentId: department.id, userId: employee.id, isPrimary: true }, null);
    await departmentManagersService.createManager(
      { organizationId: organization.id, departmentId: department.id, userId: departmentManager.id, type: 'DIRECT', isPrimary: true },
      null,
    );

    const viaDepartment = await reportingLinesService.getEffectiveManager(employee.id, organization.id);
    expect(viaDepartment).toEqual({ managerId: departmentManager.id, source: 'DEPARTMENT_MANAGER' });

    await reportingLinesService.createReportingLine(
      { organizationId: organization.id, employeeId: employee.id, managerId: personalManager.id, type: 'DIRECT', isPrimary: true },
      null,
    );

    const viaPersonal = await reportingLinesService.getEffectiveManager(employee.id, organization.id);
    expect(viaPersonal).toEqual({ managerId: personalManager.id, source: 'REPORTING_LINE' });
  });

  it('grants manager scope for direct and transitive DIRECT reports, requires RBAC manager, and is never extended by FUNCTIONAL/PROJECT', async () => {
    const organization = await createOrganization('scope');
    const topManager = await createUser(organization.id, 'TopManager');
    const midManager = await createUser(organization.id, 'MidManager');
    const ic = await createUser(organization.id, 'IC');
    const functionalOnly = await createUser(organization.id, 'FunctionalOnly');

    // topManager -> midManager -> ic (transitive), plus a FUNCTIONAL-only relation that must
    // never extend scope.
    await reportingLinesService.createReportingLine({ organizationId: organization.id, employeeId: midManager.id, managerId: topManager.id, type: 'DIRECT', isPrimary: true }, null);
    await reportingLinesService.createReportingLine({ organizationId: organization.id, employeeId: ic.id, managerId: midManager.id, type: 'DIRECT', isPrimary: true }, null);
    await reportingLinesService.createReportingLine({ organizationId: organization.id, employeeId: functionalOnly.id, managerId: topManager.id, type: 'FUNCTIONAL', isPrimary: true }, null);

    const managerScope = await scopeService.directReportIds({ id: topManager.id, organizationId: organization.id, roles: ['manager'] });
    expect(managerScope.sort()).toEqual([ic.id, midManager.id].sort());
    expect(managerScope).not.toContain(functionalOnly.id);

    // DepartmentManager alone (here: none at all) doesn't matter -- without RBAC manager role,
    // the same DIRECT relations grant no scope at all.
    const nonManagerScope = await scopeService.directReportIds({ id: topManager.id, organizationId: organization.id, roles: ['instructor'] });
    expect(nonManagerScope).toEqual([]);
  });

  it('closes the foreign tenant: a manager cannot report a user id that only exists in another organization', async () => {
    const organizationA = await createOrganization('tenant-a');
    const organizationB = await createOrganization('tenant-b');
    const managerA = await createUser(organizationA.id, 'ManagerA');
    const userB = await createUser(organizationB.id, 'UserB');

    await expect(
      reportingLinesService.createReportingLine(
        { organizationId: organizationA.id, employeeId: userB.id, managerId: managerA.id, type: 'DIRECT', isPrimary: true },
        null,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('records an OrgStructureEvent for create, update, and close', async () => {
    const organization = await createOrganization('events');
    const employee = await createUser(organization.id, 'Employee');
    const manager = await createUser(organization.id, 'Manager');

    const created = await reportingLinesService.createReportingLine(
      { organizationId: organization.id, employeeId: employee.id, managerId: manager.id, type: 'DIRECT', isPrimary: false },
      null,
    );
    await reportingLinesService.updateReportingLine(created.id, organization.id, { isPrimary: true }, null);
    await reportingLinesService.closeReportingLine(created.id, organization.id, null);

    const events = await prisma.orgStructureEvent.findMany({
      where: { organizationId: organization.id, entityType: 'reporting_line', entityId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((event) => event.eventType)).toEqual([
      'reporting_line.created',
      'reporting_line.updated',
      'reporting_line.closed',
    ]);
  });
});
