import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';

import { cardBlocks, loadEmployeeCardBlocks, type CardBlock } from '../../common/employee-card.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { EMPLOYEE_NUMBER_KEY, type CurrentUser } from '../auth/public.js';
import { ManagerTeamScope } from '../manager-team-scope/public.js';
import { UploadService } from '../upload/public.js';
import { PROFILE_PHOTO_MAX_BYTES } from '../users/profile.schemas.js';
import { clearanceOf, datedStatus, hasDetail, visibleBlocks, visibleFields, type ViewerLevel } from './employee-card.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const listLimit = 100;
/** Five scans of one badge by somebody who is not signed in, within ten minutes, tell the administrators. */
const seriesScans = 5;
const seriesMinutes = 10;
const notFound = () => new NotFoundException({ error: { code: 'CARD_NOT_FOUND', message: 'The employee card was not found' } });
const fullName = (person: { lastName: string; firstName: string; middleName?: string | null }) => [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');

type Viewer = Pick<CurrentUser, 'id' | 'organizationId' | 'roles' | 'inspector'>;

/**
 * PR 507: the card of an employee, opened by scanning the badge. The QR holds only the opaque badge token; the person who
 * scans must be signed in, sees what the organization allows everybody to see, and every opening is recorded.
 */
@Injectable()
export class EmployeeCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly teamScope: ManagerTeamScope,
    private readonly upload: UploadService,
  ) {}

  /** The badge must be active, of the viewer's organization and of a person who is still active; every other case is the same 404. */
  private async subjectOf(token: string, organizationId: string) {
    const badge = await this.prisma.userBadge.findFirst({
      where: { tokenHash: hash(token), state: 'active', organizationId },
      select: { user: { select: { id: true, organizationId: true, status: true, deletedAt: true, firstName: true, lastName: true, middleName: true, position: true, email: true, phone: true, photoObjectKey: true, photoMimeType: true } } },
    });
    const subject = badge?.user;
    if (!subject || subject.deletedAt || subject.status !== 'active' || subject.organizationId !== organizationId) throw notFound();
    return subject;
  }

  private async levelOf(viewer: Viewer, subjectId: string): Promise<ViewerLevel> {
    if (viewer.inspector) return 'inspector';
    if (viewer.id === subjectId) return 'self';
    if (viewer.roles.includes('admin')) return 'admin';
    if (viewer.roles.includes('manager') && (await this.prisma.user.count({ where: { id: subjectId, organizationId: viewer.organizationId, ...this.teamScope.user(viewer) } })) > 0) return 'manager';
    return 'peer';
  }

  async open(viewer: Viewer, token: string) {
    const subject = await this.subjectOf(token, viewer.organizationId);
    const level = await this.levelOf(viewer, subject.id);
    const everyone = await loadEmployeeCardBlocks(this.prisma, viewer.organizationId);
    const blocks = visibleBlocks(level, everyone, viewer.inspector?.visible);
    const fields = visibleFields(level, viewer.inspector?.visible);
    const detail = hasDetail(level);
    const now = new Date();
    const where = { organizationId: viewer.organizationId, userId: subject.id, deletedAt: null } as const;
    const overdueChecklist = { OR: [{ status: 'expired' as const }, { status: { in: ['assigned', 'in_progress', 'submitted'] as Array<'assigned' | 'in_progress' | 'submitted'> }, dueAt: { lt: now } }] };

    const [overdueCourses, overdueChecklists, revokedCertificates, department, number] = await Promise.all([
      this.prisma.assignment.count({ where: { ...where, status: 'assigned', dueAt: { lt: now } } }),
      this.prisma.checklistInstance.count({ where: { ...where, guestName: null, ...overdueChecklist } }),
      this.prisma.certificate.count({ where: { ...where, status: 'revoked' } }),
      fields.includes('department')
        ? this.prisma.departmentMembership.findFirst({ where: { organizationId: viewer.organizationId, userId: subject.id, effectiveTo: null }, orderBy: { isPrimary: 'desc' }, select: { department: { select: { name: true } } } })
        : null,
      fields.includes('employeeNumber')
        ? this.prisma.userFieldValue.findFirst({ where: { userId: subject.id, organizationId: viewer.organizationId, field: { key: EMPLOYEE_NUMBER_KEY, archivedAt: null } }, select: { value: true } })
        : null,
    ]);
    const clearance = clearanceOf({ overdueCourses, overdueChecklists, revokedCertificates });

    const card: Record<string, unknown> = {
      level,
      detail,
      blocks,
      subject: {
        name: fullName(subject),
        hasPhoto: fields.includes('photo') && subject.photoMimeType !== null,
        ...(fields.includes('position') ? { position: subject.position } : {}),
        ...(fields.includes('department') ? { department: department?.department.name ?? null } : {}),
        ...(fields.includes('employeeNumber') ? { employeeNumber: typeof number?.value === 'string' ? number.value : null } : {}),
        ...(detail ? { email: subject.email.endsWith('.invalid') ? null : subject.email, phone: subject.phone } : {}),
      },
    };

    if (blocks.includes('clearance')) card.clearance = viewer.inspector ? { ok: clearance.ok } : clearance;
    if (blocks.includes('courses')) {
      const rows = await this.prisma.assignment.findMany({ where: { ...where, status: { not: 'cancelled' } }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: listLimit, select: { status: true, dueAt: true, course: { select: { title: true } } } });
      card.courses = rows.map((row) => ({ title: row.course.title, status: datedStatus(row.status === 'completed', row.dueAt, now), ...(detail && row.dueAt ? { dueAt: row.dueAt.toISOString() } : {}) }));
    }
    if (blocks.includes('certificates')) {
      const rows = await this.prisma.certificate.findMany({ where, orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }], take: listLimit, select: { status: true, issuedAt: true, course: { select: { title: true } } } });
      card.certificates = rows.map((row) => ({ title: row.course.title, status: row.status === 'revoked' ? 'revoked' : 'valid', issuedAt: row.issuedAt.toISOString() }));
    }
    if (blocks.includes('checklists')) {
      const rows = await this.prisma.checklistInstance.findMany({
        where: { ...where, guestName: null }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: listLimit,
        select: { status: true, dueAt: true, percentage: true, passed: true, scored: true, checklist: { select: { title: true } } },
      });
      card.checklists = rows.map((row) => ({
        title: row.checklist.title,
        status: row.status === 'expired' ? 'overdue' : datedStatus(row.status === 'completed', row.dueAt, now),
        ...(detail && row.status === 'completed' ? { passed: row.passed, ...(row.scored ? { percentage: row.percentage } : {}) } : {}),
      }));
    }

    if (level !== 'self') {
      await this.auditLog.record({
        organizationId: viewer.organizationId, actorId: viewer.id, action: 'user.card_viewed', targetType: 'user', targetId: subject.id,
        summary: `Opened the employee card of ${fullName(subject)}`, metadata: { level, blocks },
      });
    }
    return card;
  }

  /** The viewer confirms the check: the record says who looked at whom and when. */
  async markChecked(viewer: Viewer, token: string) {
    const subject = await this.subjectOf(token, viewer.organizationId);
    await this.auditLog.record({
      organizationId: viewer.organizationId, actorId: viewer.id, action: 'user.card_checked', targetType: 'user', targetId: subject.id,
      summary: `Marked the employee card of ${fullName(subject)} as checked`,
    });
    return { checked: true, at: new Date().toISOString() };
  }

  /** The photo goes only to a viewer who may see the card and only when the viewer's fields include it. */
  async photo(viewer: Viewer, token: string) {
    const subject = await this.subjectOf(token, viewer.organizationId);
    const level = await this.levelOf(viewer, subject.id);
    if (!visibleFields(level, viewer.inspector?.visible).includes('photo') || !subject.photoObjectKey || !subject.photoMimeType) throw notFound();
    const bytes = await this.upload.getObjectBytes(subject.photoObjectKey, PROFILE_PHOTO_MAX_BYTES * 2);
    if (!bytes) throw notFound();
    return { bytes, mimeType: subject.photoMimeType };
  }

  /**
   * A scan by somebody who is not signed in. Nothing is revealed (the answer is the same for a known and an unknown badge);
   * a known badge gets a journal line, and a series of them tells the administrators once.
   */
  async anonymousScan(token: string, context: { ip: string | undefined; userAgent: string | undefined }) {
    const badge = await this.prisma.userBadge.findFirst({ where: { tokenHash: hash(token), state: 'active' }, select: { userId: true, organizationId: true, user: { select: { firstName: true, lastName: true } } } });
    if (!badge) return { recorded: true };
    await this.prisma.badgeScanLog.create({ data: { organizationId: badge.organizationId, userId: badge.userId, ip: context.ip ?? null, userAgent: context.userAgent?.slice(0, 300) ?? null } });
    const since = new Date(Date.now() - seriesMinutes * 60_000);
    const scans = await this.prisma.badgeScanLog.count({ where: { userId: badge.userId, createdAt: { gte: since } } });
    if (scans >= seriesScans) {
      const recent = await this.prisma.notification.count({ where: { organizationId: badge.organizationId, type: 'badge_scan_series', createdAt: { gte: since }, data: { path: ['userId'], equals: badge.userId } } });
      if (recent === 0) {
        const admins = await this.prisma.user.findMany({ where: { organizationId: badge.organizationId, status: 'active', deletedAt: null, memberships: { some: { organizationId: badge.organizationId, role: 'admin' } } }, select: { id: true } });
        if (admins.length > 0) {
          await this.prisma.notification.createMany({
            data: admins.map((admin) => ({ organizationId: badge.organizationId, userId: admin.id, type: 'badge_scan_series', data: { userId: badge.userId, name: fullName(badge.user), count: scans }, link: '/admin/users' })),
          });
        }
      }
    }
    return { recorded: true };
  }

  /** Who opened the card of the signed-in person lately. */
  async views(viewer: Viewer) {
    const rows = await this.prisma.auditLog.findMany({
      where: { organizationId: viewer.organizationId, targetType: 'user', targetId: viewer.id, action: 'user.card_viewed' },
      orderBy: { createdAt: 'desc' }, take: 50, select: { actorId: true, createdAt: true },
    });
    const ids = [...new Set(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])))];
    const people = ids.length === 0 ? [] : await this.prisma.user.findMany({ where: { id: { in: ids }, organizationId: viewer.organizationId }, select: { id: true, firstName: true, lastName: true, middleName: true } });
    const names = new Map(people.map((person) => [person.id, fullName(person)]));
    return { items: rows.map((row) => ({ viewer: row.actorId ? names.get(row.actorId) ?? null : null, at: row.createdAt.toISOString() })) };
  }

  async getPolicy(organizationId: string) {
    return { blocks: await loadEmployeeCardBlocks(this.prisma, organizationId) };
  }

  async updatePolicy(organizationId: string, blocks: readonly CardBlock[], actorId: string | null) {
    const before = await this.getPolicy(organizationId);
    const chosen = cardBlocks.filter((block) => blocks.includes(block));
    await this.prisma.organization.update({ where: { id: organizationId }, data: { employeeCardBlocks: chosen } });
    if (JSON.stringify(before.blocks) !== JSON.stringify(chosen)) {
      await this.auditLog.record({
        organizationId, actorId, action: 'organization.employee_card_updated', targetType: 'organization', targetId: organizationId,
        summary: `Employee card visible to everybody: ${chosen.join(', ') || 'nothing'}`, metadata: { before: before.blocks, after: chosen },
      });
    }
    return { blocks: chosen };
  }

  async listInspectors(organizationId: string) {
    const rows = await this.prisma.externalInspector.findMany({
      where: { organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 200,
      select: { userId: true, visibleBlocks: true, accessUntil: true, revokedAt: true, createdAt: true, user: { select: { email: true, firstName: true, lastName: true, status: true } } },
    });
    const now = new Date();
    return {
      items: rows.map((row) => ({
        userId: row.userId, name: fullName(row.user), email: row.user.email, visible: row.visibleBlocks, accessUntil: row.accessUntil.toISOString(), createdAt: row.createdAt.toISOString(),
        state: row.revokedAt ? 'revoked' : row.accessUntil <= now ? 'expired' : row.user.status === 'invited' ? 'invited' : 'active',
      })),
    };
  }

  async revokeInspector(organizationId: string, userId: string, actorId: string) {
    const inspector = await this.prisma.externalInspector.findFirst({ where: { userId, organizationId, revokedAt: null }, select: { id: true, user: { select: { firstName: true, lastName: true } } } });
    if (!inspector) throw new NotFoundException('Inspector not found');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.externalInspector.update({ where: { id: inspector.id }, data: { revokedAt: now } }),
      this.prisma.session.updateMany({ where: { userId, organizationId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    await this.auditLog.record({ organizationId, actorId, action: 'user.inspector_revoked', targetType: 'user', targetId: userId, summary: `Withdrew the access of the inspector ${fullName(inspector.user)}` });
    return { revoked: true };
  }
}
