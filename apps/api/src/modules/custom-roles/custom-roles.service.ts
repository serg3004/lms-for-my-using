import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { validatePermissionGrants, type PermissionScope } from '@lms/shared/permission-catalog';

import { PrismaService } from '../../database/prisma.service.js';
import { loadEffectivePermissions, type EffectivePermissions } from '../auth/public.js';

const roleSelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  state: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  permissions: { select: { action: true, scope: true }, orderBy: [{ action: 'asc' }, { scope: 'asc' }] },
} satisfies Prisma.CustomRoleSelect;

/** Data layer of custom roles (PR 480). Every query carries the organization; there is no HTTP surface yet (PR 481). */
@Injectable()
export class CustomRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async createRole(organizationId: string, input: { name: string; description?: string | null }, actorId: string | null = null) {
    try {
      return await this.prisma.customRole.create({
        data: { organizationId, name: input.name.trim(), description: input.description ?? null, createdBy: actorId },
        select: roleSelect,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A role with this name already exists');
      throw error;
    }
  }

  /** Replaces the whole grant set. The caller passes the version it read; a concurrent edit gives 409. */
  async replacePermissions(
    organizationId: string,
    roleId: string,
    expectedVersion: number,
    grants: readonly { action: string; scope: PermissionScope }[],
  ) {
    const problems = validatePermissionGrants(grants);
    if (problems.length > 0) throw new UnprocessableEntityException({ message: 'Invalid permission set', problems });

    return this.prisma.$transaction(async (tx) => {
      const bumped = await tx.customRole.updateMany({
        where: { id: roleId, organizationId, version: expectedVersion, state: 'active' },
        data: { version: { increment: 1 } },
      });
      if (bumped.count === 0) {
        const existing = await tx.customRole.findFirst({ where: { id: roleId, organizationId }, select: { state: true } });
        if (!existing) throw new NotFoundException('Role not found');
        throw new ConflictException('The role was changed by someone else, reload it');
      }
      await tx.customRolePermission.deleteMany({ where: { roleId, organizationId } });
      if (grants.length > 0) {
        await tx.customRolePermission.createMany({
          data: grants.map((grant) => ({ organizationId, roleId, action: grant.action, scope: grant.scope })),
          skipDuplicates: true,
        });
      }
      return tx.customRole.findFirstOrThrow({ where: { id: roleId, organizationId }, select: roleSelect });
    });
  }

  async archiveRole(organizationId: string, roleId: string, expectedVersion: number) {
    const result = await this.prisma.customRole.updateMany({
      where: { id: roleId, organizationId, version: expectedVersion, state: 'active' },
      data: { state: 'archived', archivedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count === 0) {
      const existing = await this.prisma.customRole.findFirst({ where: { id: roleId, organizationId }, select: { id: true } });
      if (!existing) throw new NotFoundException('Role not found');
      throw new ConflictException('The role was changed by someone else, reload it');
    }
    return this.prisma.customRole.findFirstOrThrow({ where: { id: roleId, organizationId }, select: roleSelect });
  }

  async assignRole(organizationId: string, userId: string, roleId: string, actorId: string | null = null) {
    const role = await this.prisma.customRole.findFirst({ where: { id: roleId, organizationId }, select: { state: true } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.state !== 'active') throw new UnprocessableEntityException('An archived role cannot be assigned');
    const membership = await this.prisma.membership.findFirst({ where: { organizationId, userId }, select: { id: true } });
    if (!membership) throw new NotFoundException('User is not a member of the organization');

    return this.prisma.userCustomRoleAssignment.upsert({
      where: { organizationId_userId_roleId: { organizationId, userId, roleId } },
      create: { organizationId, userId, roleId, assignedBy: actorId },
      update: { state: 'active', assignedBy: actorId },
      select: { id: true, userId: true, roleId: true, state: true },
    });
  }

  async revokeRole(organizationId: string, userId: string, roleId: string) {
    const result = await this.prisma.userCustomRoleAssignment.updateMany({
      where: { organizationId, userId, roleId, state: 'active' },
      data: { state: 'revoked' },
    });
    if (result.count === 0) throw new NotFoundException('Assignment not found');
  }

  async getOrganizationSwitch(organizationId: string): Promise<boolean> {
    const organization = await this.prisma.organization.findFirst({ where: { id: organizationId }, select: { customRolesEnabled: true } });
    if (!organization) throw new NotFoundException('Organization not found');
    return organization.customRolesEnabled;
  }

  /** Effective rights of one user: built-in roles plus active custom roles, custom roles only while the switch is on. */
  effectivePermissions(organizationId: string, userId: string): Promise<EffectivePermissions> {
    return loadEffectivePermissions(this.prisma, organizationId, userId);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}
