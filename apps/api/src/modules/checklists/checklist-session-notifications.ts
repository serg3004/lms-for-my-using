import { NotFoundException } from '@nestjs/common';
import type { ChecklistSession, Prisma } from '@prisma/client';

export const CHECKLIST_SESSION_CHANGE_NOTIFY_JOB = 'checklists.session-change-notify';
export const CHECKLIST_SESSION_CHANGE_TYPES = [
  'checklist_session_scheduled',
  'checklist_session_rescheduled',
  'checklist_session_deleted',
  'checklist_session_completed',
] as const;
export type ChecklistSessionChangeType = typeof CHECKLIST_SESSION_CHANGE_TYPES[number];
type SessionIdentity = Pick<ChecklistSession, 'id' | 'organizationId' | 'instanceId' | 'observerId'>;

/** Called only inside the authorized domain mutation's transaction. Never accepts recipients from a request. */
export async function notifySessionChange(
  tx: Prisma.TransactionClient,
  session: SessionIdentity,
  type: ChecklistSessionChangeType,
  options: { previousObserverId?: string; bulk?: boolean; alreadyNotified?: ReadonlySet<string> } = {},
): Promise<void> {
  const instance = await tx.checklistInstance.findFirst({
    where: { id: session.instanceId, organizationId: session.organizationId }, select: { userId: true },
  });
  if (!instance) throw new NotFoundException('Checklist assignment not found');

  const learnerList = '/learn/checklists';
  const observerList = '/instructor/checklists/sessions';
  const recipients = new Map([[instance.userId, type === 'checklist_session_deleted'
    ? learnerList : `${learnerList}?sessionId=${encodeURIComponent(session.id)}`]]);
  if (type !== 'checklist_session_completed') {
    recipients.set(session.observerId, type === 'checklist_session_deleted' || options.bulk
      ? observerList : `${observerList}/${encodeURIComponent(session.id)}`);
    if (options.previousObserverId && !recipients.has(options.previousObserverId)) {
      // The former observer no longer has access to the session; link to their own list.
      recipients.set(options.previousObserverId, observerList);
    }
  }
  const users = await tx.user.findMany({
    where: { organizationId: session.organizationId, id: { in: [...recipients.keys()].filter((id) => !options.alreadyNotified?.has(id)) }, deletedAt: null, status: 'active' },
    select: { id: true },
  });
  for (const user of users) {
    const notification = await tx.notification.create({ data: {
      organizationId: session.organizationId, userId: user.id, type,
      // Deliberately no names, addresses, checklist titles, results, feedback or location.
      data: { sessionId: session.id }, link: recipients.get(user.id)!,
    } });
    await tx.outboxEvent.create({ data: {
      topic: CHECKLIST_SESSION_CHANGE_NOTIFY_JOB,
      // The delivery adapter re-resolves all recipient/content data from this durable row.
      payload: { organizationId: session.organizationId, notificationId: notification.id },
    } });
  }
}
