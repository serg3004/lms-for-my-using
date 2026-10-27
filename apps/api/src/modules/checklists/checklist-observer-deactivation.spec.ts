import { jest } from '@jest/globals';
import type { Prisma } from '@prisma/client';
import { countOpenObserverSessions, notifyObserverDeactivated } from './checklist-observer-deactivation.js';

function harness(admins: string[]) {
  const tx = {
    membership: { findMany: jest.fn(async () => admins.map((userId) => ({ userId }))) },
    notification: { create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: `notice-${String(args.data['userId'])}` })) },
    outboxEvent: { create: jest.fn(async () => ({})) },
    checklistSession: { count: jest.fn(async () => 2) },
  };
  return { tx, client: tx as unknown as Prisma.TransactionClient };
}

describe('observer deactivation notices', () => {
  it('writes one notice and outbox row per distinct admin with only ids and a count', async () => {
    const { tx, client } = harness(['a1', 'a2', 'a1']);
    await notifyObserverDeactivated(client, { organizationId: 'org', observerId: 'obs', sessionCount: 2 });
    expect(tx.membership.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org', role: 'admin', user: { deletedAt: null, status: 'active' } }, select: { userId: true } });
    expect(tx.notification.create.mock.calls.map(([input]) => input.data)).toEqual(['a1', 'a2'].map((userId) => ({
      organizationId: 'org', userId, type: 'checklist_session_observer_deactivated', data: { observerId: 'obs', sessionCount: 2 }, link: '/admin/checklists/sessions?observerId=obs',
    })));
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: { topic: 'checklists.observer-deactivated-notify', payload: { organizationId: 'org', notificationId: 'notice-a1' } } });
  });

  it('skips the deactivated observer when they are also an admin, and propagates an outbox failure', async () => {
    const { tx, client } = harness(['obs']);
    await notifyObserverDeactivated(client, { organizationId: 'org', observerId: 'obs', sessionCount: 1 });
    expect(tx.notification.create).not.toHaveBeenCalled();
    const failing = harness(['a1']);
    failing.tx.outboxEvent.create.mockRejectedValueOnce(new Error('outbox failed'));
    await expect(notifyObserverDeactivated(failing.client, { organizationId: 'org', observerId: 'obs', sessionCount: 1 })).rejects.toThrow('outbox failed');
  });

  it('counts only open sessions of the observer inside the organization', async () => {
    const { tx, client } = harness([]);
    await expect(countOpenObserverSessions(client, 'org', 'obs')).resolves.toBe(2);
    expect(tx.checklistSession.count).toHaveBeenCalledWith({ where: { organizationId: 'org', observerId: 'obs', deletedAt: null, status: { in: ['scheduled', 'in_progress', 'paused'] } } });
  });
});
