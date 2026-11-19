import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { validatePermissionGrants, type PermissionScope } from '@lms/shared/permission-catalog';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
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

type Grant = { action: string; scope: PermissionScope };
type RoleView = { id: string; name: string; description: string | null; permissions: Grant[] };

const grantKey = (grant: Grant) => `${grant.action}:${grant.scope}`;

/** Grants added and removed between two sets, for the audit journal. */
export function diffGrants(before: readonly Grant[], after: readonly Grant[]) {
  const was = new Set(before.map(grantKey));
  const now = new Set(after.map(grantKey));
  return { added: after.filter((grant) => !was.has(grantKey(grant))).map(grantKey), removed: before.filter((grant) => !now.has(grantKey(grant))).map(grantKey) };
}

/**
 * Custom roles (PR 480, API in PR 484). Every query carries the organization, so a role or a user of another
 * organization is never found (404). With an `actorId` each change is written to the audit journal.
 */
@Injectable()
export class CustomRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  async listRoles(organizationId: string, state?: 'active' | 'archived') {
    const roles = await this.prisma.customRole.findMany({
      where: { organizationId, ...(state ? { state } : {}) },
      select: { ...roleSelect, _count: { select: { assignments: { where: { state: 'active' } } } } },
      orderBy: [{ state: 'asc' }, { name: 'asc' }],
    });
    return roles.map(({ _count, ...role }) => ({ ...role, userCount: _count.assignments }));
  }

  async getRole(organizationId: string, roleId: string) {
    const role = await this.prisma.customRole.findFirst({ where: { id: roleId, organizationId }, select: roleSelect });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async listAssignments(organizationId: string, roleId: string) {
    await this.getRole(organizationId, roleId);
    const rows = await this.prisma.userCustomRoleAssignment.findMany({
      where: { organizationId, roleId, state: 'active' },
      select: { userId: true, createdAt: true, user: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({ userId: row.userId, assignedAt: row.createdAt, email: row.user.email, firstName: row.user.firstName, lastName: row.user.lastName }));
  }

  /** Creates a role, optionally from another role of the same organization ("create based on"); explicit permissions win. */
  async createFrom(
    organizationId: string,
    input: { name: string; description?: string | null; permissions?: readonly Grant[]; basedOnRoleId?: string },
    actorId: string,
  ) {
    let source: RoleView | null = null;
    if (input.basedOnRoleId) {
      source = await this.prisma.customRole.findFirst({ where: { id: input.basedOnRoleId, organizationId }, select: { id: true, name: true, description: true, permissions: { select: { action: true, scope: true } } } });
      if (!source) throw new NotFoundException('Role not found');
    }
    const grants = input.permissions ?? source?.permissions ?? [];
    const problems = validatePermissionGrants(grants);
    if (problems.length > 0) throw new UnprocessableEntityException({ message: 'Invalid permission set', problems });

    const created = await this.createRole(organizationId, { name: input.name, description: input.description ?? source?.description ?? null }, actorId);
    const role = grants.length > 0 ? await this.replacePermissions(organizationId, created.id, created.version, grants) : created;
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'custom_role.created',
      targetType: 'custom_role',
      targetId: role.id,
      summary: `Created custom role ${role.name}`,
      metadata: { ...(source ? { basedOn: source.id } : {}), permissions: role.permissions.map(grantKey) },
    });
    return role;
  }

  /** Changes name, description and/or the grant set in one step against the version the caller read (409 when stale). */
  async updateRole(
    organizationId: string,
    roleId: string,
    input: { version: number; name?: string; description?: string | null; permissions?: readonly Grant[] },
    actorId: string,
  ) {
    const before = await this.getRole(organizationId, roleId);
    let role = before;
    if (input.permissions) {
      role = await this.replacePermissions(organizationId, roleId, input.version, input.permissions);
    }
    if (input.name !== undefined || input.description !== undefined) {
      const expected = input.permissions ? role.version : input.version;
      try {
        const updated = await this.prisma.customRole.updateMany({
          where: { id: roleId, organizationId, version: expected, state: 'active' },
          data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.description !== undefined ? { description: input.description } : {}), version: { increment: 1 } },
        });
        if (updated.count === 0) throw new ConflictException('The role was changed by someone else, reload it');
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictException('A role with this name already exists');
        throw error;
      }
      role = await this.getRole(organizationId, roleId);
    } else if (!input.permissions) {
      if (before.version !== input.version || before.state !== 'active') throw new ConflictException('The role was changed by someone else, reload it');
    }
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'custom_role.updated',
      targetType: 'custom_role',
      targetId: roleId,
      summary: `Changed custom role ${role.name}`,
      metadata: { ...diffGrants(before.permissions, role.permissions), ...(before.name !== role.name ? { renamedFrom: before.name } : {}) },
    });
    return role;
  }

  async archiveAndRecord(organizationId: string, roleId: string, expectedVersion: number, actorId: string) {
    const role = await this.archiveRole(organizationId, roleId, expectedVersion);
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'custom_role.archived',
      targetType: 'custom_role',
      targetId: roleId,
      summary: `Archived custom role ${role.name}`,
      metadata: { permissions: role.permissions.map(grantKey) },
    });
    return role;
  }

  async assignAndRecord(organizationId: string, userId: string, roleId: string, actorId: string) {
    const assignment = await this.assignRole(organizationId, userId, roleId, actorId);
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'custom_role.assigned',
      targetType: 'user',
      targetId: userId,
      summary: 'Assigned a custom role',
      metadata: { roleId },
    });
    return assignment;
  }

  async revokeAndRecord(organizationId: string, userId: string, roleId: string, actorId: string) {
    await this.revokeRole(organizationId, userId, roleId);
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'custom_role.revoked',
      targetType: 'user',
      targetId: userId,
      summary: 'Revoked a custom role',
      metadata: { roleId },
    });
  }

  /** What a user may do and why: built-in or custom, per action and scope, plus the active custom roles held. */
  async describeEffective(organizationId: string, userId: string) {
    const [permissions, enabled, assignments] = await Promise.all([
      this.effectivePermissions(organizationId, userId),
      this.getOrganizationSwitch(organizationId),
      this.prisma.userCustomRoleAssignment.findMany({
        where: { organizationId, userId, state: 'active', role: { organizationId, state: 'active' } },
        select: { role: { select: { id: true, name: true } } },
      }),
    ]);
    return {
      customRolesEnabled: enabled,
      customRoles: assignments.map((assignment) => assignment.role),
      permissions: [...permissions.entries()]
        .map(([action, value]) => ({ action, builtIn: value.builtIn, scopes: [...value.scopes].sort() }))
        .sort((a, b) => a.action.localeCompare(b.action)),
    };
  }

  async userExists(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId, deletedAt: null }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
  }

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
