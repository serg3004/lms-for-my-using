import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { notifySessionChange } from './checklist-session-notifications.js';

const session = { id: 'session', organizationId: 'org', instanceId: 'instance', observerId: 'observer' };
function harness(learner = 'learner') {
  const tx = {
    checklistInstance: { findFirst: jest.fn(async () => ({ userId: learner })) },
    user: { findMany: jest.fn(async (args: { where: { id: { in: string[] } } }) => args.where.id.in.map((id) => ({ id }))) },
    notification: { create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'notice', ...args.data })) },
    outboxEvent: { create: jest.fn(async () => ({})) },
  };
  return { tx, client: tx as unknown as Prisma.TransactionClient };
}
describe('session change notifications', () => {
  it('derives unique recipients and only safe data inside the supplied transaction', async () => {
    const { tx, client } = harness();
    await notifySessionChange(client, session, 'checklist_session_rescheduled', { previousObserverId: 'old-observer' });
    expect(tx.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org', id: { in: ['learner', 'observer', 'old-observer'] }, deletedAt: null, status: 'active' } }));
    const notices = tx.notification.create.mock.calls.map(([input]) => input.data);
    expect(notices).toEqual([
      { organizationId: 'org', userId: 'learner', type: 'checklist_session_rescheduled', data: { sessionId: 'session' }, link: '/learn/checklists?sessionId=session' },
      { organizationId: 'org', userId: 'observer', type: 'checklist_session_rescheduled', data: { sessionId: 'session' }, link: '/instructor/checklists/sessions/session' },
      { organizationId: 'org', userId: 'old-observer', type: 'checklist_session_rescheduled', data: { sessionId: 'session' }, link: '/instructor/checklists/sessions' },
    ]);
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: { topic: 'checklists.session-change-notify', payload: { organizationId: 'org', notificationId: 'notice' } } });
  });
  it('notifies a learner/observer overlap only once and a completion only to the learner', async () => {
    const { tx, client } = harness('observer');
    await notifySessionChange(client, session, 'checklist_session_scheduled');
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    tx.notification.create.mockClear();
    await notifySessionChange(client, session, 'checklist_session_completed');
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    expect(tx.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ link: '/learn/checklists?sessionId=session' }) }));
  });
  it('excludes committed batch recipients without changing retry state and uses lists after deletion', async () => {
    const { tx, client } = harness();
    const alreadyNotified = new Set(['observer']);
    await notifySessionChange(client, session, 'checklist_session_scheduled', { bulk: true, alreadyNotified });
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    expect([...alreadyNotified]).toEqual(['observer']);
    tx.notification.create.mockClear();
    await notifySessionChange(client, session, 'checklist_session_deleted');
    const links = tx.notification.create.mock.calls.map(([input]) => input.data.link);
    expect(links).toEqual(['/learn/checklists', '/instructor/checklists/sessions']);
  });
  it('fails closed for a foreign assignment and propagates an outbox failure to roll back the mutation', async () => {
    const { tx, client } = harness();
    tx.checklistInstance.findFirst.mockResolvedValueOnce(null as never);
    await expect(notifySessionChange(client, session, 'checklist_session_scheduled')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.notification.create).not.toHaveBeenCalled();
    tx.outboxEvent.create.mockRejectedValueOnce(new Error('outbox failed'));
    await expect(notifySessionChange(client, session, 'checklist_session_scheduled')).rejects.toThrow('outbox failed');
  });
});
