/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { DepartmentMembershipsService } from '../modules/department-memberships/department-memberships.service.js';
import { DepartmentsService } from '../modules/departments/departments.service.js';
import { OrgStructureAdminService } from '../modules/org-structure-admin/org-structure-admin.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

type PrismaServiceType = import('../database/prisma.service.js').PrismaService;

/**
 * Exercises PR 280's CSV import preview/commit against real Postgres: malformed
 * UUIDs must surface as validation errors (never a raw database error), an archived
 * department can never become a live parent through import, and replacing a user's
 * primary membership via import must close the prior relation with its own durable
 * history event rather than silently disappearing.
 */
describe('org structure admin CSV import (database)', () => {
  const prisma = new PrismaClient();
  const typedPrisma = prisma as unknown as PrismaServiceType;
  const departmentsService = new DepartmentsService(typedPrisma);
  const membershipsService = new DepartmentMembershipsService(typedPrisma);
  const service = new OrgStructureAdminService(typedPrisma);
  const organizationIds: string[] = [];

  beforeAll(() => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
  });

  afterAll(async () => {
    await prisma.orgStructureEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.positionCourse.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.position.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.course.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.group.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.orgStructureImportPreview.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.departmentMembership.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.department.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  async function createOrganization(label: string) {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Org structure admin ${label} ${suffix}`, slug: `org-structure-admin-${label}-${suffix}` },
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

  async function createDepartment(organizationId: string, name: string) {
    return departmentsService.createDepartment(
      { organizationId, name, code: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}`, sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
  }

  function departmentsCsv(rows: string[][]) {
    const header = 'code,name,parentCode,typeCode,sortOrder,directManagerMode,functionalManagerMode,directManagerUserIds,functionalManagerUserIds';
    return Buffer.from([header, ...rows.map((r) => r.join(','))].join('\n') + '\n');
  }

  function membershipsCsv(rows: string[][]) {
    const header = 'userId,departmentCode,membershipType,positionCode,effectiveFrom';
    return Buffer.from([header, ...rows.map((r) => r.join(','))].join('\n') + '\n');
  }

  it('reports a malformed userId as a validation error instead of a database error', async () => {
    const organization = await createOrganization('malformed-uuid');
    const department = await createDepartment(organization.id, 'Dept');

    const preview = await service.preview(
      membershipsCsv([['not-a-uuid', department.code!, 'PRIMARY', '', '']]),
      'MEMBERSHIPS',
      'CREATE_ONLY',
      organization.id,
      randomUUID(),
    );

    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual([expect.objectContaining({ field: 'userId' })]);
  });

  it('rejects a department import row that parents an active department under an archived one', async () => {
    const organization = await createOrganization('archived-parent');
    const parent = await createDepartment(organization.id, 'Parent');
    await departmentsService.archiveDepartment(parent.id, organization.id, null);

    const preview = await service.preview(
      departmentsCsv([['child', 'Child', parent.code!, '', '', '', '', '', '']]),
      'DEPARTMENTS',
      'CREATE_ONLY',
      organization.id,
      randomUUID(),
    );

    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'parentCode', message: expect.stringContaining('Archived') })]),
    );
  });

  it('closes the prior primary membership and records its own event when an import replaces it', async () => {
    const organization = await createOrganization('primary-replace');
    const user = await createUser(organization.id, 'Employee');
    const oldDepartment = await createDepartment(organization.id, 'Old');
    const newDepartment = await createDepartment(organization.id, 'New');
    const actorId = (await createUser(organization.id, 'Actor')).id;

    const oldMembership = await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: oldDepartment.id, userId: user.id, isPrimary: true },
      null,
    );

    const preview = await service.preview(
      membershipsCsv([[user.id, newDepartment.code!, 'PRIMARY', '', '']]),
      'MEMBERSHIPS',
      'UPSERT',
      organization.id,
      actorId,
    );
    expect(preview.valid).toBe(true);
    expect(preview.token).toBeDefined();

    await service.commit(preview.token!, organization.id, actorId);

    const closedMembership = await prisma.departmentMembership.findUnique({ where: { id: oldMembership.id } });
    expect(closedMembership?.effectiveTo).not.toBeNull();

    const events = await prisma.orgStructureEvent.findMany({
      where: { organizationId: organization.id, entityType: 'department_membership' },
      orderBy: { createdAt: 'asc' },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: oldMembership.id, eventType: 'department_membership.closed' }),
        expect.objectContaining({ eventType: 'department_membership.created' }),
      ]),
    );
  });

  it('counts only active org-structure rows of the caller organization', async () => {
    const organization = await createOrganization('counts');
    const other = await createOrganization('counts-other');
    const organizationId = organization.id;

    await createDepartment(organizationId, 'Active');
    const archived = await createDepartment(organizationId, 'Archived');
    await prisma.department.update({ where: { id: archived.id }, data: { status: 'archived', archivedAt: new Date() } });
    await createDepartment(other.id, 'Foreign');

    const position = await prisma.position.create({ data: { organizationId, code: `P-${randomUUID().slice(0, 8)}`, title: 'Active position' } });
    await prisma.position.create({ data: { organizationId, code: `P-${randomUUID().slice(0, 8)}`, title: 'Archived position', status: 'archived', archivedAt: new Date() } });
    await prisma.position.create({ data: { organizationId: other.id, code: `P-${randomUUID().slice(0, 8)}`, title: 'Foreign position' } });

    const course = await prisma.course.create({ data: { organizationId, title: `Course ${randomUUID()}`, slug: `course-${randomUUID()}`, status: 'published' } });
    const archivedCourse = await prisma.course.create({ data: { organizationId, title: `Course ${randomUUID()}`, slug: `course-${randomUUID()}`, status: 'published' } });
    await prisma.positionCourse.create({ data: { organizationId, positionId: position.id, courseId: course.id } });
    await prisma.positionCourse.create({ data: { organizationId, positionId: position.id, courseId: archivedCourse.id, status: 'archived', archivedAt: new Date() } });

    await prisma.group.create({ data: { organizationId, name: 'Active group', slug: `g-${randomUUID()}` } });
    await prisma.group.create({ data: { organizationId, name: 'Archived group', slug: `g-${randomUUID()}`, status: 'archived' } });
    await prisma.group.create({ data: { organizationId, name: 'Deleted group', slug: `g-${randomUUID()}`, deletedAt: new Date() } });
    await prisma.group.create({ data: { organizationId: other.id, name: 'Foreign group', slug: `g-${randomUUID()}` } });

    const historyEvents = await prisma.orgStructureEvent.count({ where: { organizationId } });

    await expect(service.counts(organizationId)).resolves.toEqual({
      departments: 1,
      positions: 1,
      positionCourses: 1,
      groups: 1,
      historyEvents,
    });
    expect(historyEvents).toBeGreaterThan(0);
  });
});
