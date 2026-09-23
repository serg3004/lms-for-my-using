import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { ChecklistSessionService } from './checklist-session.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const sessionId = '22222222-2222-2222-2222-222222222222';
const instanceId = '33333333-3333-3333-3333-333333333333';
const observerId = '44444444-4444-4444-4444-444444444444';
const actorId = '55555555-5555-5555-5555-555555555555';

function baseSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: sessionId,
    organizationId,
    instanceId,
    observerId,
    status: 'scheduled',
    version: 1,
    scheduledAt: null,
    startedAt: null,
    pausedAt: null,
    locationCapturePolicy: 'off',
    timezone: 'Asia/Almaty',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * `$transaction` just invokes the callback with this same mock object, which is enough for
 * unit-level branch coverage of the state machine. Real Serializable-conflict/retry behavior
 * is covered separately by the database integration spec (race-safety of terminal actions).
 */
function createPrisma(overrides: {
  checklistSession?: Partial<Record<'findFirst' | 'findUniqueOrThrow' | 'findMany' | 'count' | 'create' | 'updateMany', jest.Mock>>;
  checklistSessionEvent?: Partial<Record<'create' | 'findMany', jest.Mock>>;
  checklistInstance?: Partial<Record<'findFirst', jest.Mock>>;
  user?: Partial<Record<'findFirst', jest.Mock>>;
} = {}) {
  const base: Record<string, unknown> = {
    checklistSession: {
      findFirst: jest.fn(async () => baseSession()),
      findUniqueOrThrow: jest.fn(async () => baseSession()),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      create: jest.fn(async () => baseSession()),
      updateMany: jest.fn(async () => ({ count: 1 })),
      ...overrides.checklistSession,
    },
    checklistSessionEvent: {
      create: jest.fn(async () => ({})),
      findMany: jest.fn(async () => []),
      ...overrides.checklistSessionEvent,
    },
    checklistInstance: {
      findFirst: jest.fn(async () => ({ id: instanceId })),
      ...overrides.checklistInstance,
    },
    user: {
      findFirst: jest.fn(async () => ({ id: observerId })),
      ...overrides.user,
    },
  };
  base['$transaction'] = jest.fn(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(base),
  );
  return base as unknown as PrismaService;
}

describe('ChecklistSessionService', () => {
  describe('create', () => {
    it('creates a session and records a "created" event', async () => {
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);

      const result = await service.create(organizationId, { instanceId, observerId }, actorId);

      expect(result).toMatchObject({ id: sessionId, status: 'scheduled', overdue: false });
      expect(prisma.checklistSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizationId, instanceId, observerId }) }),
      );
      expect(prisma.checklistSessionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'created', sessionId, actorUserId: actorId }) }),
      );
    });

    it('rejects an observer who does not hold the instructor role', async () => {
      const prisma = createPrisma({ user: { findFirst: jest.fn(async () => null) } });
      const service = new ChecklistSessionService(prisma);

      await expect(service.create(organizationId, { instanceId, observerId }, actorId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a session for an instance that does not exist in this tenant', async () => {
      const prisma = createPrisma({ checklistInstance: { findFirst: jest.fn(async () => null) } });
      const service = new ChecklistSessionService(prisma);

      await expect(service.create(organizationId, { instanceId, observerId }, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('maps a unique-instance-id constraint violation to 409 (the instance already has a session)', async () => {
      const conflict = Object.assign(new Error('duplicate'), { code: 'P2002', meta: { target: ['instance_id'] } });
      const prisma = createPrisma({
        checklistSession: {
          create: jest.fn(async () => {
            throw conflict;
          }),
        },
      });
      const service = new ChecklistSessionService(prisma);

      await expect(service.create(organizationId, { instanceId, observerId }, actorId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('transition', () => {
    it('starts a scheduled session and records a "started" event with startedAt set', async () => {
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);

      await service.transition(sessionId, organizationId, 'start', 1, actorId, {});

      expect(prisma.checklistSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sessionId, organizationId, version: 1, status: { in: ['scheduled'] } },
          data: expect.objectContaining({ status: 'in_progress', version: { increment: 1 }, startedAt: expect.any(Date) }),
        }),
      );
      expect(prisma.checklistSessionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'started', actorUserId: actorId }) }),
      );
    });

    it('rejects an invalid transition (e.g. completing a scheduled session) as a 400, not a 409', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ status: 'scheduled' })) } });
      const service = new ChecklistSessionService(prisma);

      await expect(service.transition(sessionId, organizationId, 'complete', 1, actorId, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.checklistSession.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a stale version with 409 before attempting the write', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ version: 2 })) } });
      const service = new ChecklistSessionService(prisma);

      await expect(service.transition(sessionId, organizationId, 'start', 1, actorId, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.checklistSession.updateMany).not.toHaveBeenCalled();
    });

    it('treats a lost race on the conditional update itself as a stale write (409)', async () => {
      const prisma = createPrisma({ checklistSession: { updateMany: jest.fn(async () => ({ count: 0 })) } });
      const service = new ChecklistSessionService(prisma);

      await expect(service.transition(sessionId, organizationId, 'start', 1, actorId, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.checklistSessionEvent.create).not.toHaveBeenCalled();
    });

    it('throws 404 when the session is outside the caller scope', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => null) } });
      const service = new ChecklistSessionService(prisma);

      await expect(
        service.transition(sessionId, organizationId, 'start', 1, actorId, { observerId: 'someone-else' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('pauses an in-progress session, resumes it, then completes it — the full lifecycle', async () => {
      let status = 'in_progress';
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ status })) } });
      const service = new ChecklistSessionService(prisma);

      await service.transition(sessionId, organizationId, 'pause', 1, actorId, {});
      expect(prisma.checklistSession.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'paused', pausedAt: expect.any(Date) }) }),
      );

      status = 'paused';
      await service.transition(sessionId, organizationId, 'resume', 1, actorId, {});
      expect(prisma.checklistSession.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'in_progress', pausedAt: null }) }),
      );

      status = 'in_progress';
      await service.transition(sessionId, organizationId, 'complete', 1, actorId, {});
      expect(prisma.checklistSession.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }),
      );
    });

    it('rejects completing a paused session directly (must resume first, per the ADR diagram)', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ status: 'paused' })) } });
      const service = new ChecklistSessionService(prisma);

      await expect(service.transition(sessionId, organizationId, 'complete', 1, actorId, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('only allows cancel from scheduled', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ status: 'in_progress' })) } });
      const service = new ChecklistSessionService(prisma);

      await expect(service.transition(sessionId, organizationId, 'cancel', 1, actorId, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('rejects rescheduling once the session has left "scheduled"', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ status: 'in_progress' })) } });
      const service = new ChecklistSessionService(prisma);

      await expect(
        service.update(sessionId, organizationId, { version: 1, scheduledAt: null }, actorId, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records both "rescheduled" and "observer_reassigned" when the observer changes', async () => {
      const newObserverId = '66666666-6666-6666-6666-666666666666';
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);

      await service.update(sessionId, organizationId, { version: 1, observerId: newObserverId }, actorId, {});

      const eventTypes = (prisma.checklistSessionEvent.create as jest.Mock).mock.calls.map(
        // @ts-expect-error jest.Mock call args are untyped here
        ([arg]) => arg.data.eventType,
      );
      expect(eventTypes).toEqual(['rescheduled', 'observer_reassigned']);
    });
  });

  describe('list', () => {
    it('filters to overdue-only when requested', async () => {
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);

      await service.list(organizationId, { overdueOnly: 'true', page: 1, pageSize: 25 }, {});

      expect(prisma.checklistSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'scheduled', scheduledAt: { lt: expect.any(Date) } }),
        }),
      );
    });
  });
});
