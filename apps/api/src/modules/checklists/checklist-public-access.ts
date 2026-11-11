import { randomBytes } from 'node:crypto';

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { AuditLogService } from '../audit-log/public.js';
import type { UpdateChecklistPublicAccessInput } from './checklists.schemas.js';

/**
 * PR 464: entry to a free checklist by a permanent link / QR code (settings only; the public operations are PR 465).
 *
 * - Only an administrator changes anything here, even when the sheet has "everyone may edit" on.
 * - Only a published sheet with free access can have the entry on. A sheet that stops being published or free
 *   (draft, archive, "by assignment", also through the bulk bar) switches it off automatically.
 * - The token is random (192 bits), unique and never written to the audit log or the logs; it is kept while the entry
 *   is off (a printed QR code works again when it is switched back on) and replaced on reissue, which makes the old
 *   link invalid at once.
 * - A guest has no account: the pass belongs to one service user "Guest" of the organization (no memberships, cannot
 *   sign in; created on the first public pass in PR 465) and the typed name is stored on the instance (`guestName`).
 */

export const PUBLIC_TOKEN_BYTES = 24;

/** 192 bits of randomness as URL-safe text (32 characters). */
export function newPublicToken(): string {
  return randomBytes(PUBLIC_TOKEN_BYTES).toString('base64url');
}

export const isEligibleForPublicAccess = (sheet: { status: string; accessMode: string }) => sheet.status === 'published' && sheet.accessMode === 'free';

/** The columns written when a sheet loses its eligibility (draft, archive, "by assignment", folder deletion). */
export const publicAccessOffData = (actorId: string | null, now = new Date()) => ({ publicAccess: 'off' as const, publicAccessChangedAt: now, publicAccessChangedBy: actorId });

const selectState = {
  id: true, status: true, accessMode: true, publicAccess: true, publicToken: true, guestNameRequired: true, guestPhotosAllowed: true,
  publicAccessChangedAt: true, publicAccessChangedBy: true,
} as const;
type StateRow = Prisma.ChecklistGetPayload<{ select: typeof selectState }>;

type Actor = { id: string; roles: readonly string[] };
const isAdmin = (actor: Actor) => actor.roles.includes('admin');

export type PublicAccessState = {
  checklistId: string;
  access: 'off' | 'registered' | 'everyone';
  guestNameRequired: boolean;
  guestPhotosAllowed: boolean;
  /** A published sheet with free access: the only kind that can have the entry on. */
  eligible: boolean;
  hasLink: boolean;
  changedAt: string | null;
  /** Administrator only (the last person who switched or reissued); null for everyone else. */
  changedBy: { id: string; name: string } | null;
  /** Administrator only; every other role sees the state but never the token. */
  token: string | null;
};

/** Plain helper (built in ChecklistsService's constructor body, not injected). */
export class ChecklistPublicAccess {
  constructor(private readonly prisma: { checklist: Prisma.TransactionClient['checklist']; user: Prisma.TransactionClient['user'] }, private readonly auditLog: Pick<AuditLogService, 'record'>) {}

  private async load(organizationId: string, checklistId: string): Promise<StateRow> {
    const sheet = await this.prisma.checklist.findFirst({ where: { id: checklistId, organizationId, deletedAt: null }, select: selectState });
    if (!sheet) throw new NotFoundException('Checklist not found');
    return sheet;
  }

  private async present(organizationId: string, sheet: StateRow, actor: Actor): Promise<PublicAccessState> {
    const admin = isAdmin(actor);
    let changedBy: PublicAccessState['changedBy'] = null;
    if (admin && sheet.publicAccessChangedBy) {
      const user = await this.prisma.user.findFirst({ where: { id: sheet.publicAccessChangedBy, organizationId }, select: { id: true, firstName: true, lastName: true } });
      if (user) changedBy = { id: user.id, name: `${user.lastName} ${user.firstName}`.trim() };
    }
    return {
      checklistId: sheet.id,
      access: sheet.publicAccess,
      guestNameRequired: sheet.guestNameRequired,
      guestPhotosAllowed: sheet.guestPhotosAllowed,
      eligible: isEligibleForPublicAccess(sheet),
      hasLink: sheet.publicToken !== null,
      changedAt: sheet.publicAccessChangedAt ? sheet.publicAccessChangedAt.toISOString() : null,
      changedBy,
      token: admin ? sheet.publicToken : null,
    };
  }

  async get(organizationId: string, checklistId: string, actor: Actor): Promise<PublicAccessState> {
    return this.present(organizationId, await this.load(organizationId, checklistId), actor);
  }

  /** Switches the entry, changes the guest rules. Nothing changes (and nothing is logged) when the request repeats the stored state. */
  async update(organizationId: string, checklistId: string, actor: Actor, input: UpdateChecklistPublicAccessInput): Promise<PublicAccessState> {
    if (!isAdmin(actor)) throw new ForbiddenException('Only an administrator can change the public entry of a checklist');
    const sheet = await this.load(organizationId, checklistId);
    const storedAt = sheet.publicAccessChangedAt ? sheet.publicAccessChangedAt.toISOString() : null;
    // The sheet was switched or reissued by someone else since the screen was loaded.
    if (input.expectedChangedAt !== undefined && input.expectedChangedAt !== storedAt) throw new ConflictException('The public entry was changed by someone else. Reload and try again.');

    const nextAccess = input.access ?? sheet.publicAccess;
    if (nextAccess !== 'off' && !isEligibleForPublicAccess(sheet)) throw new BadRequestException('Only a published checklist with free access can be opened by a link');
    const accessChanged = nextAccess !== sheet.publicAccess;
    const data: Prisma.ChecklistUpdateInput = {};
    if (input.guestNameRequired !== undefined && input.guestNameRequired !== sheet.guestNameRequired) data.guestNameRequired = input.guestNameRequired;
    if (input.guestPhotosAllowed !== undefined && input.guestPhotosAllowed !== sheet.guestPhotosAllowed) data.guestPhotosAllowed = input.guestPhotosAllowed;
    if (accessChanged) {
      data.publicAccess = nextAccess;
      data.publicAccessChangedAt = new Date();
      data.publicAccessChangedBy = actor.id;
      if (nextAccess !== 'off' && sheet.publicToken === null) data.publicToken = newPublicToken();
    }
    if (Object.keys(data).length === 0) return this.present(organizationId, sheet, actor);

    const updated = await this.write(organizationId, checklistId, data, storedAt);
    await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'checklist.public_access.updated',
      targetType: 'checklist',
      targetId: checklistId,
      summary: accessChanged ? `Changed the link entry of a checklist: ${sheet.publicAccess} -> ${nextAccess}` : 'Changed the guest rules of the link entry of a checklist',
      // Settings only. The token never goes into the log.
      metadata: { previousAccess: sheet.publicAccess, access: updated.publicAccess, guestNameRequired: updated.guestNameRequired, guestPhotosAllowed: updated.guestPhotosAllowed },
    });
    return this.present(organizationId, updated, actor);
  }

  /** A new token: the old link and QR code stop working at once. */
  async reissue(organizationId: string, checklistId: string, actor: Actor): Promise<PublicAccessState> {
    if (!isAdmin(actor)) throw new ForbiddenException('Only an administrator can change the public entry of a checklist');
    const sheet = await this.load(organizationId, checklistId);
    if (!isEligibleForPublicAccess(sheet)) throw new BadRequestException('Only a published checklist with free access has a link');
    const updated = await this.write(organizationId, checklistId, { publicToken: newPublicToken(), publicAccessChangedAt: new Date(), publicAccessChangedBy: actor.id }, undefined);
    await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'checklist.public_access.reissued',
      targetType: 'checklist',
      targetId: checklistId,
      summary: 'Reissued the link of a checklist; the previous link no longer works',
      metadata: { access: updated.publicAccess },
    });
    return this.present(organizationId, updated, actor);
  }

  /** One write; a token that happens to exist already (practically impossible) is drawn again once, and a stale screen answers 409. */
  private async write(organizationId: string, checklistId: string, data: Prisma.ChecklistUpdateInput, expectedChangedAt: string | null | undefined): Promise<StateRow> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // The expected stamp is part of the condition, so two administrators saving at once cannot both win.
        const result = await this.prisma.checklist.updateMany({
          where: { id: checklistId, organizationId, deletedAt: null, ...(expectedChangedAt !== undefined ? { publicAccessChangedAt: expectedChangedAt === null ? null : new Date(expectedChangedAt) } : {}) },
          data: data as Prisma.ChecklistUpdateManyMutationInput,
        });
        if (result.count === 0) throw new ConflictException('The public entry was changed by someone else. Reload and try again.');
        return await this.load(organizationId, checklistId);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && data.publicToken !== undefined && attempt === 0) {
          data = { ...data, publicToken: newPublicToken() };
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Unable to issue a link. Try again.');
  }
}
