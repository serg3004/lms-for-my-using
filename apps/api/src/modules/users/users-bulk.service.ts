import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { ManagerTeamScope, type TeamScopeActor } from '../manager-team-scope/public.js';
import { UserRegistrarAccess } from './user-registrar-access.js';
import { bulkActionMaxUsers, type BulkActionInput, type BulkActionName, type BulkImpactInput } from './users.schemas.js';
import { UsersService } from './users.service.js';

export type BulkItemStatus = 'done' | 'unchanged' | 'notFound' | 'forbidden' | 'conflict' | 'rateLimited' | 'failed';
export type BulkItem = { userId: string; status: BulkItemStatus; reason?: string };

const CONCURRENCY = 5;

/** Maps the message of a refused single-user operation to a stable reason the screen translates. */
function reasonOf(error: unknown): { status: BulkItemStatus; reason?: string } {
  if (!(error instanceof HttpException)) return { status: 'failed' };
  const code = error.getStatus();
  if (code === HttpStatus.NOT_FOUND) return { status: 'notFound' };
  if (code === HttpStatus.TOO_MANY_REQUESTS) return { status: 'rateLimited' };
  const message = error.message.toLowerCase();
  const reason = message.includes('yourself') ? 'self'
    : message.includes('last active administrator') ? 'lastAdmin'
    : message.includes('must be restored') ? 'archived'
    : message.includes('only an administrator') ? 'adminOnly'
    : undefined;
  if (code === HttpStatus.FORBIDDEN) return { status: 'forbidden', ...(reason ? { reason } : {}) };
  if (code === HttpStatus.CONFLICT) return { status: 'conflict', ...(reason ? { reason } : {}) };
  return { status: 'failed' };
}

/**
 * PR 497: one action over many users. Every person goes through the same scope and safety rules as the single-user route
 * (a manager reaches only their team; nobody blocks themselves or the last active administrator), so a refusal is reported per
 * person and never stops the others. Repeating a batch is harmless: a person already in the target state is `unchanged`.
 */
@Injectable()
export class UsersBulkService {
  private readonly registrars: UserRegistrarAccess;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly auditLog: AuditLogService,
    private readonly teamScope: ManagerTeamScope,
  ) {
    this.registrars = new UserRegistrarAccess(prisma);
  }

  /** The ids the request names, or everyone matching the filter inside the actor's scope (refused above the ceiling). */
  async resolveTargets(actor: TeamScopeActor, target: Pick<BulkImpactInput, 'userIds' | 'filter'>): Promise<string[]> {
    if (target.userIds) return target.userIds;
    const where = await this.users.listWhere(actor, target.filter?.search, target.filter?.status);
    const rows = await this.prisma.user.findMany({ where, select: { id: true }, orderBy: { createdAt: 'desc' }, take: bulkActionMaxUsers + 1 });
    if (rows.length > bulkActionMaxUsers) {
      throw new BadRequestException(`More than ${bulkActionMaxUsers} users match the filter; narrow it down`);
    }
    return rows.map((row) => row.id);
  }

  /** What archiving these people would affect, summed (the single-user figures of PR 495). Not-found people are skipped. */
  async impact(actor: TeamScopeActor, target: BulkImpactInput) {
    const ids = await this.resolveTargets(actor, target);
    const total = { users: 0, observerSessions: 0, soleInstructorCourses: 0, openAssignments: 0, subordinates: 0, managedDepartments: 0 };
    await this.inChunks(ids, async (userId) => {
      try {
        const impact = await this.users.getObserverSessionImpact(userId, actor);
        total.users += 1;
        total.observerSessions += impact.observerSessions;
        total.soleInstructorCourses += impact.soleInstructorCourses.length;
        total.openAssignments += impact.openAssignments;
        total.subordinates += impact.subordinates;
        total.managedDepartments += impact.managedDepartments;
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    });
    return total;
  }

  async run(actor: TeamScopeActor, input: BulkActionInput) {
    if (input.action === 'archive' && !actor.roles.includes('admin')) {
      throw new ForbiddenException('Only an administrator can archive or restore a user');
    }
    if (input.action === 'archive' && input.confirm !== true) {
      throw new ConflictException('Archiving needs confirmation of its impact');
    }
    const ids = await this.resolveTargets(actor, input);
    const departmentId = input.action === 'move' ? await this.assertMoveTarget(actor, input.departmentId!) : null;

    const { action } = input;
    const items = action === 'resend'
      ? (await this.users.resendInvitations(actor, ids)).items.map((item): BulkItem => ({ userId: item.userId, ...(item.status === 'sent' ? { status: 'done' } : item.status === 'notFound' ? { status: 'notFound' } : item.status === 'rateLimited' ? { status: 'rateLimited' } : { status: 'failed' }) }))
      : await this.mapChunks(ids, (userId) => this.applyOne(actor, action, userId, departmentId));

    const summary = {
      requested: ids.length,
      done: items.filter((item) => item.status === 'done').length,
      unchanged: items.filter((item) => item.status === 'unchanged').length,
      failed: items.filter((item) => item.status !== 'done' && item.status !== 'unchanged').length,
    };
    await this.auditLog.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'user.bulk_action',
      targetType: 'user',
      targetId: null,
      summary: `Bulk action ${input.action} over ${summary.requested} users`,
      metadata: { action: input.action, ...summary, ...(departmentId ? { departmentId } : {}), by: input.userIds ? 'selection' : 'filter' },
    });
    return { action: input.action, summary, items };
  }

  /** The department a batch moves people into: inside the actor's own area, existing and active. */
  private async assertMoveTarget(actor: TeamScopeActor, departmentId: string): Promise<string> {
    const registrar = await this.registrars.resolveCreation(actor);
    const checked = registrar
      ? await this.registrars.assertDepartment(registrar, actor.organizationId, departmentId)
      : await this.registrars.assertDepartment({ scope: 'organization', departmentIds: null }, actor.organizationId, departmentId);
    if (!checked) throw new NotFoundException('Department not found');
    return checked;
  }

  private async applyOne(actor: TeamScopeActor, action: Exclude<BulkActionName, 'resend'>, userId: string, departmentId: string | null): Promise<BulkItem> {
    try {
      const registrar = await this.registrars.resolve(actor);
      const user = await this.prisma.user.findFirst({
        where: { id: userId, organizationId: actor.organizationId, ...this.teamScope.user(actor), ...this.registrars.writeWhere(registrar, actor), deletedAt: null },
        select: { id: true, status: true },
      });
      if (!user) return { userId, status: 'notFound' };

      if (action === 'move') return await this.move(actor, userId, user.status, departmentId!);

      const target = action === 'suspend' ? 'suspended' : action === 'archive' ? 'archived' : 'active';
      if (user.status === target) return { userId, status: 'unchanged' };
      if (action === 'activate' && user.status === 'invited') return { userId, status: 'conflict', reason: 'invited' };
      await this.users.updateUserStatus(userId, actor, target, action === 'archive');
      return { userId, status: 'done' };
    } catch (error) {
      return { userId, ...reasonOf(error) };
    }
  }

  private async move(actor: TeamScopeActor, userId: string, status: string, departmentId: string): Promise<BulkItem> {
    if (status === 'archived') return { userId, status: 'conflict', reason: 'archived' };
    const organizationId = actor.organizationId;
    const outcome = await this.prisma.$transaction(async (tx) => {
      const current = await tx.departmentMembership.findFirst({
        where: { organizationId, userId, isPrimary: true, effectiveTo: null },
        select: { id: true, departmentId: true },
      });
      if (current?.departmentId === departmentId) return { changed: false, from: departmentId };
      const now = new Date();
      if (current) await tx.departmentMembership.update({ where: { id: current.id }, data: { effectiveTo: now } });
      await tx.departmentMembership.create({ data: { organizationId, userId, departmentId, isPrimary: true, effectiveFrom: now } });
      return { changed: true, from: current?.departmentId ?? null };
    });
    if (!outcome.changed) return { userId, status: 'unchanged' };
    await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'user.department_changed',
      targetType: 'user',
      targetId: userId,
      summary: 'Moved user to another department',
      metadata: { fromDepartmentId: outcome.from, toDepartmentId: departmentId, bulk: true },
    });
    return { userId, status: 'done' };
  }

  private async inChunks(ids: string[], work: (id: string) => Promise<void>) {
    for (let start = 0; start < ids.length; start += CONCURRENCY) await Promise.all(ids.slice(start, start + CONCURRENCY).map(work));
  }

  private async mapChunks(ids: string[], work: (id: string) => Promise<BulkItem>): Promise<BulkItem[]> {
    const items: BulkItem[] = [];
    for (let start = 0; start < ids.length; start += CONCURRENCY) items.push(...(await Promise.all(ids.slice(start, start + CONCURRENCY).map(work))));
    return items;
  }
}
