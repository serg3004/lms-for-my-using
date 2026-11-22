import { ConflictException } from '@nestjs/common';

import { cardBlocks, inspectorFields, type CardBlock, type InspectorField } from '../../common/employee-card.js';

export type ViewerLevel = 'self' | 'admin' | 'manager' | 'peer' | 'inspector';

/** Scores, attempts and contacts are shown only to the person, the administrator and the manager of the team. */
export const hasDetail = (level: ViewerLevel) => level === 'self' || level === 'admin' || level === 'manager';

export function visibleBlocks(level: ViewerLevel, everyone: readonly CardBlock[], inspector: readonly string[] | undefined): CardBlock[] {
  if (hasDetail(level)) return [...cardBlocks];
  if (level === 'inspector') return cardBlocks.filter((block) => inspector?.includes(block));
  return cardBlocks.filter((block) => everyone.includes(block));
}

/** Which header facts a viewer sees. The full name is never in this list: it is always shown. */
export function visibleFields(level: ViewerLevel, inspector: readonly string[] | undefined): InspectorField[] {
  return level === 'inspector' ? inspectorFields.filter((field) => inspector?.includes(field)) : [...inspectorFields];
}

export type DatedStatus = 'done' | 'overdue' | 'open';

export function datedStatus(done: boolean, dueAt: Date | null, now: Date): DatedStatus {
  if (done) return 'done';
  return dueAt !== null && dueAt < now ? 'overdue' : 'open';
}

/** The sign of admission: nothing is overdue and no certificate was withdrawn. */
export function clearanceOf(counts: { overdueCourses: number; overdueChecklists: number; revokedCertificates: number }) {
  return { ok: counts.overdueCourses + counts.overdueChecklists + counts.revokedCertificates === 0, ...counts };
}

/** The longest access an inspector can get, so that a forgotten account does not stay open for years. */
export const inspectorMaxDays = 90;

export function assertInspectorTerm(accessUntil: Date, now = new Date()) {
  if (accessUntil <= now) throw new ConflictException('The access must end in the future');
  if (accessUntil.getTime() > now.getTime() + inspectorMaxDays * 86_400_000) throw new ConflictException(`The access cannot last longer than ${inspectorMaxDays} days`);
}
