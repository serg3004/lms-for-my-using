import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import {
  ChecklistInstanceTransfer, CHECKLIST_INSTANCE_TRANSFER_NOTIFY_JOB, CHECKLIST_INSTANCE_TRANSFER_TYPE, colleagueWhere, mayHandOver, transferBlocker,
  type TransferActor,
} from './checklist-instance-transfer.js';

const org = '11111111-1111-1111-1111-111111111111';
const instanceId = '22222222-2222-2222-2222-222222222222';
const executor = '33333333-3333-3333-3333-333333333333';
const colleague = '44444444-4444-4444-4444-444444444444';
const stranger = '55555555-5555-5555-5555-555555555555';
const updatedAt = new Date('2026-11-19T05:00:00.000Z');
const learner = (id = executor): TransferActor => ({ id, organizationId: org, roles: ['learner'] });

describe('transferBlocker (PR 477)', () => {
  const open = { userId: executor, status: 'in_progress', guestName: null, session: null };
  it('lets an open check of a person go', () => {
    expect(transferBlocker(open)).toBeNull();
    expect(transferBlocker({ ...open, status: 'assigned' })).toBeNull();
  });
  it.each(['submitted', 'completed', 'expired'])('refuses a %s check with a conflict', (status) => {
    expect(transferBlocker({ ...open, status })?.kind).toBe('conflict');
  });
  it('refuses a session and a guest pass', () => {
    expect(transferBlocker({ ...open, session: { id: 's' } })?.kind).toBe('bad');
    expect(transferBlocker({ ...open, guestName: 'Guest' })?.kind).toBe('bad');
  });
});

describe('mayHandOver (PR 477)', () => {
  it('allows the executor, an administrator and a manager', () => {
    expect(mayHandOver(learner(), executor)).toBe(true);
    expect(mayHandOver({ id: stranger, organizationId: org, roles: ['admin'] }, executor)).toBe(true);
    expect(mayHandOver({ id: stranger, organizationId: org, roles: ['manager'] }, executor)).toBe(true);
  });
  it('refuses another learner, an instructor and a mentor', () => {
    for (const role of ['learner', 'instructor', 'mentor']) expect(mayHandOver({ id: stranger, organizationId: org, roles: [role] }, executor)).toBe(false);
  });
});

describe('colleagueWhere (PR 477)', () => {
  it('is active users of the organization from the executor departments, never the executor', () => {
    expect(colleagueWhere(org, executor, ['d1'])).toEqual({
      organizationId: org, status: 'active', deletedAt: null, id: { not: executor },
      departmentMemberships: { some: { organizationId: org, departmentId: { in: ['d1'] }, effectiveTo: null } },
    });
  });
});

type Instance = { id: string; userId: string; status: string; guestName: string | null; updatedAt: Date; session: { id: string } | null };
function setup(overrides: { instance?: Partial<Instance> | null; departments?: string[]; recipient?: boolean; claimed?: number } = {}) {
  const instance: Instance | null = overrides.instance === null ? null : { id: instanceId, userId: executor, status: 'in_progress', guestName: null, updatedAt, session: null, ...overrides.instance };
  const tx = {
    checklistInstance: { updateMany: jest.fn(async () => ({ count: overrides.claimed ?? 1 })) },
    checklistInstanceEvent: { create: jest.fn(async () => ({})) },
    notification: { create: jest.fn(async () => ({ id: 'n1' })) },
    outboxEvent: { create: jest.fn(async () => ({})) },
  };
  const prisma = {
    checklistInstance: { findFirst: jest.fn(async () => instance) },
    departmentMembership: { findMany: jest.fn(async () => (overrides.departments ?? ['d1']).map((departmentId) => ({ departmentId }))) },
    user: {
      findFirst: jest.fn(async () => (overrides.recipient === false ? null : { id: colleague })),
      findMany: jest.fn(async () => [{ id: colleague, firstName: 'Anna', lastName: 'Ivanova' }]),
    },
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new ChecklistInstanceTransfer(prisma as never, audit as never);
  return { service, prisma, tx, audit };
}

describe('ChecklistInstanceTransfer.transfer (PR 477)', () => {
  it('moves the check to a colleague, records the event, notifies them and audits without names or note', async () => {
    const { service, tx, audit } = setup();
    await expect(service.transfer(instanceId, learner(), { toUserId: colleague, note: '  Gate 3 is open  ' })).resolves.toEqual({ id: instanceId, userId: colleague });
    expect(tx.checklistInstance.updateMany).toHaveBeenCalledWith({
      where: { id: instanceId, organizationId: org, userId: executor, status: { in: ['assigned', 'in_progress'] }, updatedAt },
      data: { userId: colleague },
    });
    expect(tx.checklistInstanceEvent.create).toHaveBeenCalledWith({ data: { organizationId: org, instanceId, eventType: 'transferred', actorUserId: executor, metadata: { fromUserId: executor, toUserId: colleague, note: 'Gate 3 is open' } } });
    expect(tx.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: colleague, type: CHECKLIST_INSTANCE_TRANSFER_TYPE, data: { instanceId }, link: `/learn/checklists?open=${instanceId}` }) });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: { topic: CHECKLIST_INSTANCE_TRANSFER_NOTIFY_JOB, payload: { organizationId: org, notificationId: 'n1' } } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist_instance.transferred', metadata: { fromUserId: executor, toUserId: colleague, hasNote: true } }));
  });

  it('lets an administrator and a manager hand over a check of someone else, but not another learner', async () => {
    await expect(setup().service.transfer(instanceId, { id: stranger, organizationId: org, roles: ['admin'] }, { toUserId: colleague })).resolves.toBeDefined();
    await expect(setup().service.transfer(instanceId, { id: stranger, organizationId: org, roles: ['manager'] }, { toUserId: colleague })).resolves.toBeDefined();
    await expect(setup().service.transfer(instanceId, learner(stranger), { toUserId: colleague })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers 404 for a check of another organization or a deleted one', async () => {
    await expect(setup({ instance: null }).service.transfer(instanceId, learner(), { toUserId: colleague })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a finished check (409), a session and a guest pass (400), and the executor themselves (400)', async () => {
    await expect(setup({ instance: { status: 'completed' } }).service.transfer(instanceId, learner(), { toUserId: colleague })).rejects.toBeInstanceOf(ConflictException);
    await expect(setup({ instance: { session: { id: 's' } } }).service.transfer(instanceId, learner(), { toUserId: colleague })).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ instance: { guestName: 'G' } }).service.transfer(instanceId, learner(), { toUserId: colleague })).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup().service.transfer(instanceId, learner(), { toUserId: executor })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a person who is not a colleague (other department, other organization, blocked) and an executor without a department', async () => {
    await expect(setup({ recipient: false }).service.transfer(instanceId, learner(), { toUserId: stranger })).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ departments: [] }).service.transfer(instanceId, learner(), { toUserId: colleague })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 409 and moves nothing when the version on screen is old or the claim is lost to a parallel change', async () => {
    const stale = setup();
    await expect(stale.service.transfer(instanceId, learner(), { toUserId: colleague, expectedUpdatedAt: '2026-11-19T04:00:00.000Z' })).rejects.toBeInstanceOf(ConflictException);
    expect(stale.tx.checklistInstance.updateMany).not.toHaveBeenCalled();
    const raced = setup({ claimed: 0 });
    await expect(raced.service.transfer(instanceId, learner(), { toUserId: colleague, expectedUpdatedAt: updatedAt.toISOString() })).rejects.toBeInstanceOf(ConflictException);
    expect(raced.tx.checklistInstanceEvent.create).not.toHaveBeenCalled();
    expect(raced.tx.notification.create).not.toHaveBeenCalled();
    expect(raced.audit.record).not.toHaveBeenCalled();
  });

  it('keeps an empty note out of the event', async () => {
    const { service, tx } = setup();
    await service.transfer(instanceId, learner(), { toUserId: colleague, note: '   ' });
    expect(tx.checklistInstanceEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ metadata: { fromUserId: executor, toUserId: colleague } }) });
  });
});

describe('ChecklistInstanceTransfer.candidates (PR 477)', () => {
  it('lists colleagues of the executor by name, for the executor and for a manager, and nothing for a stranger or a finished check', async () => {
    const found = setup();
    await expect(found.service.candidates(instanceId, learner())).resolves.toEqual([{ id: colleague, firstName: 'Anna', lastName: 'Ivanova' }]);
    expect(found.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true, firstName: true, lastName: true }, take: 200 }));
    await expect(setup().service.candidates(instanceId, learner(stranger))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup({ instance: { status: 'completed' } }).service.candidates(instanceId, learner())).resolves.toEqual([]);
  });
  it('is empty when the executor has no department', async () => {
    await expect(setup({ departments: [] }).service.candidates(instanceId, learner())).resolves.toEqual([]);
  });
});

describe('ChecklistInstanceTransfer.history and transferredAway (PR 477)', () => {
  it('names who handed the check to whom, oldest first, with the note', async () => {
    const { service, prisma } = setup();
    (prisma as unknown as { checklistInstanceEvent: object }).checklistInstanceEvent = {
      findMany: jest.fn(async () => [{ id: 'e1', createdAt: updatedAt, metadata: { fromUserId: executor, toUserId: colleague, note: 'Hi' } }]),
    };
    prisma.user.findMany.mockResolvedValueOnce([{ id: colleague, firstName: 'Anna', lastName: 'Ivanova' }, { id: executor, firstName: 'Boris', lastName: 'Petrov' }]);
    await expect(service.history(instanceId, org)).resolves.toEqual([{
      id: 'e1', at: updatedAt, note: 'Hi', from: { id: executor, firstName: 'Boris', lastName: 'Petrov' }, to: { id: colleague, firstName: 'Anna', lastName: 'Ivanova' },
    }]);
  });
  it('lists each open check the user handed away once, newest first', async () => {
    const { service, prisma } = setup();
    const row = (id: string, at: string) => ({ createdAt: new Date(at), metadata: {}, instance: { id, checklistId: 'c', status: 'in_progress', checklist: { title: 'T' }, user: { id: colleague, firstName: 'A', lastName: 'B' } } });
    const findMany = jest.fn(async () => [row('i2', '2026-11-19T06:00:00Z'), row('i1', '2026-11-19T05:00:00Z'), row('i2', '2026-11-19T04:00:00Z')]);
    (prisma as unknown as { checklistInstanceEvent: object }).checklistInstanceEvent = { findMany };
    const rows = await service.transferredAway(executor, org);
    expect(rows.map((entry) => entry.id)).toEqual(['i2', 'i1']);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ eventType: 'transferred', metadata: { path: ['fromUserId'], equals: executor } }) }));
  });
});
