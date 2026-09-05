/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { DepartmentsService } from '../modules/departments/departments.service.js';
import { OrgExternalReferencesService } from '../modules/org-external-references/org-external-references.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

type PrismaServiceType = import('../database/prisma.service.js').PrismaService;

/**
 * PR 283 exercises OrgExternalReference against real Postgres: the compound unique index
 * (organization, sourceSystem, entityType, externalId) rejects a duplicate before any silent
 * remap, cross-tenant resolution is impossible even when the externalId string collides, and
 * archiving the mapped entity never deletes its mapping history nor gets reactivated by resolve.
 */
describe('org external references (database)', () => {
  const prisma = new PrismaClient();
  const typedPrisma = prisma as unknown as PrismaServiceType;
  const departmentsService = new DepartmentsService(typedPrisma);
  const service = new OrgExternalReferencesService(typedPrisma);
  const organizationIds: string[] = [];

  beforeAll(() => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
  });

  afterAll(async () => {
    await prisma.orgStructureEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.orgExternalReference.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.department.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  async function createOrganization(label: string) {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Org external references ${label} ${suffix}`, slug: `org-external-refs-${label}-${suffix}` },
    });
    organizationIds.push(organization.id);
    return organization;
  }

  async function createDepartment(organizationId: string, name: string) {
    return departmentsService.createDepartment(
      { organizationId, name, sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
  }

  it('creates a mapping, resolves it back, and records a durable history event', async () => {
    const organization = await createOrganization('create-resolve');
    const department = await createDepartment(organization.id, 'Engineering');

    // sourceSystem normalization (lowercasing) happens in the Zod schema at the controller
    // boundary, not in the service -- the service trusts its already-validated input, same as
    // every other org-structure service. This test passes already-normalized input and covers
    // the service/database contract; org-external-references.schemas.spec.ts covers normalization.
    const created = await service.create(
      { organizationId: organization.id, entityType: 'DEPARTMENT', entityId: department.id, sourceSystem: 'workday', externalId: 'ENG-001' },
      null,
    );
    expect(created.sourceSystem).toBe('workday');

    const resolved = await service.resolve(organization.id, { entityType: 'DEPARTMENT', sourceSystem: 'workday', externalId: 'ENG-001' });
    expect(resolved).toEqual({
      entityType: 'DEPARTMENT',
      entityId: department.id,
      entityStatus: 'active',
      sourceSystem: 'workday',
      externalId: 'ENG-001', // externalId is case-exact, never normalized
    });

    const events = await prisma.orgStructureEvent.findMany({ where: { organizationId: organization.id, entityType: 'org_external_reference' } });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: 'org_external_reference.created', entityId: created.id })]));
  });

  it('rejects a duplicate (organization, sourceSystem, entityType, externalId) instead of silently remapping', async () => {
    const organization = await createOrganization('no-silent-remap');
    const departmentA = await createDepartment(organization.id, 'Sales');
    const departmentB = await createDepartment(organization.id, 'Marketing');

    await service.create({ organizationId: organization.id, entityType: 'DEPARTMENT', entityId: departmentA.id, sourceSystem: 'hris', externalId: 'DUP-1' }, null);

    await expect(
      service.create({ organizationId: organization.id, entityType: 'DEPARTMENT', entityId: departmentB.id, sourceSystem: 'hris', externalId: 'DUP-1' }, null),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('allows the same internal entity to hold mappings from multiple source systems', async () => {
    const organization = await createOrganization('multi-source');
    const department = await createDepartment(organization.id, 'Support');

    await service.create({ organizationId: organization.id, entityType: 'DEPARTMENT', entityId: department.id, sourceSystem: 'workday', externalId: 'SUP-1' }, null);
    await service.create({ organizationId: organization.id, entityType: 'DEPARTMENT', entityId: department.id, sourceSystem: 'bamboohr', externalId: 'SUP-1' }, null);

    const list = await service.list(organization.id, { page: 1, pageSize: 25, entityId: department.id });
    expect(list.total).toBe(2);
  });

  it('is tenant-scoped: an identical sourceSystem/externalId in another tenant never resolves cross-tenant', async () => {
    const organizationA = await createOrganization('tenant-a');
    const organizationB = await createOrganization('tenant-b');
    const departmentA = await createDepartment(organizationA.id, 'Ops A');
    const departmentB = await createDepartment(organizationB.id, 'Ops B');

    await service.create({ organizationId: organizationA.id, entityType: 'DEPARTMENT', entityId: departmentA.id, sourceSystem: 'workday', externalId: 'SHARED-ID' }, null);
    await service.create({ organizationId: organizationB.id, entityType: 'DEPARTMENT', entityId: departmentB.id, sourceSystem: 'workday', externalId: 'SHARED-ID' }, null);

    const resolvedFromA = await service.resolve(organizationA.id, { entityType: 'DEPARTMENT', sourceSystem: 'workday', externalId: 'SHARED-ID' });
    expect(resolvedFromA.entityId).toBe(departmentA.id);

    const resolvedFromB = await service.resolve(organizationB.id, { entityType: 'DEPARTMENT', sourceSystem: 'workday', externalId: 'SHARED-ID' });
    expect(resolvedFromB.entityId).toBe(departmentB.id);
  });

  it('keeps the mapping after the entity is archived, and resolve reports archived without reactivating it', async () => {
    const organization = await createOrganization('archive-history');
    const department = await createDepartment(organization.id, 'Legacy Team');
    await service.create({ organizationId: organization.id, entityType: 'DEPARTMENT', entityId: department.id, sourceSystem: 'workday', externalId: 'LEGACY-1' }, null);

    await departmentsService.archiveDepartment(department.id, organization.id, null);

    const resolved = await service.resolve(organization.id, { entityType: 'DEPARTMENT', sourceSystem: 'workday', externalId: 'LEGACY-1' });
    expect(resolved.entityStatus).toBe('archived');

    const stillArchived = await prisma.department.findUnique({ where: { id: department.id }, select: { status: true } });
    expect(stillArchived?.status).toBe('archived'); // resolving the mapping never reactivates the entity
  });

  it('rejects mapping to an entity that does not exist in this tenant', async () => {
    const organization = await createOrganization('missing-entity');

    await expect(
      service.create({ organizationId: organization.id, entityType: 'DEPARTMENT', entityId: randomUUID(), sourceSystem: 'workday', externalId: 'GHOST-1' }, null),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('deletes a mapping and records its own durable history event', async () => {
    const organization = await createOrganization('delete');
    const department = await createDepartment(organization.id, 'Temp');
    const created = await service.create({ organizationId: organization.id, entityType: 'DEPARTMENT', entityId: department.id, sourceSystem: 'workday', externalId: 'TEMP-1' }, null);

    await service.delete(created.id, organization.id, null);

    await expect(
      service.resolve(organization.id, { entityType: 'DEPARTMENT', sourceSystem: 'workday', externalId: 'TEMP-1' }),
    ).rejects.toMatchObject({ status: 404 });

    const events = await prisma.orgStructureEvent.findMany({ where: { organizationId: organization.id, entityType: 'org_external_reference', eventType: 'org_external_reference.deleted' } });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: created.id })]));
  });
});
