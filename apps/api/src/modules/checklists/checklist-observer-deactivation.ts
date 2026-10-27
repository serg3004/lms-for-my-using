import type { Prisma } from '@prisma/client';

export const CHECKLIST_OBSERVER_DEACTIVATED_NOTIFY_JOB = 'checklists.observer-deactivated-notify';
export const CHECKLIST_OBSERVER_DEACTIVATED_TYPE = 'checklist_session_observer_deactivated';
/** Sessions that still need an observer: not finished, not cancelled, not deleted. */
export const OPEN_OBSERVER_SESSION_STATUSES = ['scheduled', 'in_progress', 'paused'] as const;

type SessionReader = Pick<Prisma.TransactionClient, 'checklistSession'>;

export function countOpenObserverSessions(client: SessionReader, organizationId: string, observerId: string): Promise<number> {
  return client.checklistSession.count({
    where: { organizationId, observerId, deletedAt: null, status: { in: [...OPEN_OBSERVER_SESSION_STATUSES] } },
  });
}

/**
 * PR 346: called inside the status-change transaction when an active observer with open sessions is
 * deactivated. Recipients are the organization's active admins, resolved here, never from a request.
 * Data holds only ids and a count -- no names, e-mail addresses or session content.
 */
export async function notifyObserverDeactivated(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; observerId: string; sessionCount: number },
): Promise<void> {
  const admins = await tx.membership.findMany({
    where: { organizationId: input.organizationId, role: 'admin', user: { deletedAt: null, status: 'active' } },
    select: { userId: true },
  });
  const link = `/admin/checklists/sessions?observerId=${encodeURIComponent(input.observerId)}`;
  for (const userId of new Set(admins.map((admin) => admin.userId))) {
    if (userId === input.observerId) continue;
    const notification = await tx.notification.create({ data: {
      organizationId: input.organizationId, userId, type: CHECKLIST_OBSERVER_DEACTIVATED_TYPE,
      data: { observerId: input.observerId, sessionCount: input.sessionCount }, link,
    } });
    await tx.outboxEvent.create({ data: {
      topic: CHECKLIST_OBSERVER_DEACTIVATED_NOTIFY_JOB,
      payload: { organizationId: input.organizationId, notificationId: notification.id },
    } });
  }
}
