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
  checklistSessionReminder?: Partial<Record<'upsert' | 'updateMany' | 'findMany', jest.Mock>>;
  checklistLocationCapture?: Partial<Record<'create' | 'findMany', jest.Mock>>;
  checklistInstance?: Partial<Record<'findFirst', jest.Mock>>;
  user?: Partial<Record<'findFirst' | 'findMany' | 'count', jest.Mock>>;
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
    checklistSessionReminder: {
      upsert: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 0 })),
      findMany: jest.fn(async () => []),
      ...overrides.checklistSessionReminder,
    },
    checklistLocationCapture: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'capture-1', ...args.data })),
      findMany: jest.fn(async () => []),
      ...overrides.checklistLocationCapture,
    },
    checklistInstance: {
      findFirst: jest.fn(async () => ({ id: instanceId })),
      ...overrides.checklistInstance,
    },
    user: {
      findFirst: jest.fn(async () => ({ id: observerId })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
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

  describe('captureLocation', () => {
    it('rejects capture when the session policy is "off"', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ locationCapturePolicy: 'off' })) } });
      const service = new ChecklistSessionService(prisma);

      await expect(
        service.captureLocation(sessionId, organizationId, 'start', { status: 'captured', latitude: 1, longitude: 1 }, observerId, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.checklistLocationCapture.create).not.toHaveBeenCalled();
    });

    it('records a capture submitted by the assigned observer without requiring an override reason', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ locationCapturePolicy: 'required' })) } });
      const service = new ChecklistSessionService(prisma);

      await service.captureLocation(sessionId, organizationId, 'start', { status: 'captured', latitude: 51.1, longitude: 71.4 }, observerId, {});

      expect(prisma.checklistLocationCapture.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sessionId, capturePoint: 'start', status: 'captured', capturedBy: observerId }) }),
      );
      expect(prisma.checklistSessionEvent.create).not.toHaveBeenCalled();
    });

    it('requires an overrideReason when someone other than the observer submits a capture', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ locationCapturePolicy: 'required' })) } });
      const service = new ChecklistSessionService(prisma);
      const adminId = '66666666-6666-6666-6666-666666666666';

      await expect(
        service.captureLocation(sessionId, organizationId, 'start', { status: 'denied' }, adminId, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.checklistLocationCapture.create).not.toHaveBeenCalled();
    });

    it('audits an admin override with a location_override event and the reason in its metadata', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ locationCapturePolicy: 'required' })) } });
      const service = new ChecklistSessionService(prisma);
      const adminId = '66666666-6666-6666-6666-666666666666';

      await service.captureLocation(
        sessionId,
        organizationId,
        'end',
        { status: 'unavailable', overrideReason: 'Observer device had no GPS signal' },
        adminId,
        {},
      );

      expect(prisma.checklistSessionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'location_override',
            actorUserId: adminId,
            metadata: expect.objectContaining({ capturePoint: 'end', overrideReason: 'Observer device had no GPS signal' }),
          }),
        }),
      );
    });

    it('maps a duplicate capture-point submission to a 409, not a silent overwrite', async () => {
      const conflict = Object.assign(new Error('duplicate'), { code: 'P2002', meta: { target: ['session_id', 'capture_point'] } });
      const prisma = createPrisma({
        checklistSession: { findFirst: jest.fn(async () => baseSession({ locationCapturePolicy: 'optional' })) },
        checklistLocationCapture: {
          create: jest.fn(async () => {
            throw conflict;
          }),
        },
      });
      const service = new ChecklistSessionService(prisma);

      await expect(
        service.captureLocation(sessionId, organizationId, 'start', { status: 'captured', latitude: 1, longitude: 1 }, observerId, {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 404 when the session is outside the caller scope', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => null) } });
      const service = new ChecklistSessionService(prisma);

      await expect(
        service.captureLocation(sessionId, organizationId, 'start', { status: 'captured', latitude: 1, longitude: 1 }, observerId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listLocationCaptures', () => {
    const rawCapture = {
      id: 'capture-1',
      organizationId,
      sessionId,
      capturePoint: 'start',
      status: 'captured',
      latitude: 51.1,
      longitude: 71.4,
      accuracyMeters: 5,
      capturedBy: observerId,
      capturedAt: new Date(),
    };

    it('returns full coordinates to the assigned observer', async () => {
      const prisma = createPrisma({ checklistLocationCapture: { findMany: jest.fn(async () => [rawCapture]) } });
      const service = new ChecklistSessionService(prisma);

      const result = await service.listLocationCaptures(sessionId, organizationId, {}, observerId, false);

      expect(result[0]).toMatchObject({ latitude: 51.1, longitude: 71.4 });
    });

    it('returns full coordinates to an admin', async () => {
      const prisma = createPrisma({ checklistLocationCapture: { findMany: jest.fn(async () => [rawCapture]) } });
      const service = new ChecklistSessionService(prisma);

      const result = await service.listLocationCaptures(sessionId, organizationId, {}, 'someone-else', true);

      expect(result[0]).toMatchObject({ latitude: 51.1, longitude: 71.4 });
    });

    it('redacts coordinates for everyone else (privacy-safe projection)', async () => {
      const prisma = createPrisma({ checklistLocationCapture: { findMany: jest.fn(async () => [rawCapture]) } });
      const service = new ChecklistSessionService(prisma);

      const result = await service.listLocationCaptures(sessionId, organizationId, {}, 'a-manager', false);

      expect(result[0]).not.toHaveProperty('latitude');
      expect(result[0]).not.toHaveProperty('longitude');
      expect(result[0]).not.toHaveProperty('accuracyMeters');
      expect(result[0]).toMatchObject({ capturePoint: 'start', status: 'captured' });
    });
  });

  describe('reminders (PR 291)', () => {
    it('creates a pending pre_start reminder 24h before scheduledAt on create', async () => {
      const scheduledAt = new Date('2026-10-01T12:00:00.000Z');
      const created = baseSession({ scheduledAt });
      const prisma = createPrisma({ checklistSession: { create: jest.fn(async () => created) } });
      const service = new ChecklistSessionService(prisma);

      await service.create(organizationId, { instanceId, observerId, scheduledAt: scheduledAt.toISOString() }, actorId);

      expect(prisma.checklistSessionReminder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            reminderType: 'pre_start',
            status: 'pending',
            scheduledFor: new Date('2026-09-30T12:00:00.000Z'),
          }),
        }),
      );
    });

    it('creates no reminder on create when no scheduledAt is given', async () => {
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);

      await service.create(organizationId, { instanceId, observerId }, actorId);

      expect(prisma.checklistSessionReminder.upsert).not.toHaveBeenCalled();
      expect(prisma.checklistSessionReminder.updateMany).not.toHaveBeenCalled();
    });

    it('moves the pre_start reminder when the session is rescheduled', async () => {
      const newScheduledAt = new Date('2026-11-01T09:00:00.000Z');
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);

      await service.update(sessionId, organizationId, { version: 1, scheduledAt: newScheduledAt.toISOString() }, actorId, {});

      // The upsert-shaped helper tries an update-if-pending first, then falls back to upsert.
      expect(prisma.checklistSessionReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sessionId, reminderType: 'pre_start', status: 'pending' }),
          data: { scheduledFor: new Date('2026-10-31T09:00:00.000Z') },
        }),
      );
    });

    it('suppresses the pre_start reminder when the schedule is cleared on reschedule', async () => {
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);

      await service.update(sessionId, organizationId, { version: 1, scheduledAt: null }, actorId, {});

      expect(prisma.checklistSessionReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sessionId, reminderType: 'pre_start', status: 'pending' }),
          data: { status: 'suppressed' },
        }),
      );
    });

    it('creates an incomplete_after_start reminder exactly once, on start', async () => {
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);

      await service.transition(sessionId, organizationId, 'start', 1, actorId, {});

      expect(prisma.checklistSessionReminder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ reminderType: 'incomplete_after_start', status: 'pending' }),
        }),
      );
    });

    it('suppresses pending reminders when a session completes', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ status: 'in_progress' })) } });
      const service = new ChecklistSessionService(prisma);

      await service.transition(sessionId, organizationId, 'complete', 1, actorId, {});

      expect(prisma.checklistSessionReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId, sessionId, status: 'pending' }, data: { status: 'suppressed' } }),
      );
    });

    it('suppresses pending reminders when a session is cancelled', async () => {
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);

      await service.transition(sessionId, organizationId, 'cancel', 1, actorId, {});

      expect(prisma.checklistSessionReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId, sessionId, status: 'pending' }, data: { status: 'suppressed' } }),
      );
    });

    it('does not touch reminders on pause/resume (only start/complete/cancel do)', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => baseSession({ status: 'in_progress' })) } });
      const service = new ChecklistSessionService(prisma);

      await service.transition(sessionId, organizationId, 'pause', 1, actorId, {});

      expect(prisma.checklistSessionReminder.upsert).not.toHaveBeenCalled();
      expect(prisma.checklistSessionReminder.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('bulkCreate (PR 292)', () => {
    const learnerA = '66666666-6666-6666-6666-666666666666';
    const learnerB = '77777777-7777-7777-7777-777777777777';
    const checklistId = '88888888-8888-8888-8888-888888888888';

    function createChecklistsServiceMock(overrides: { assignChecklist?: jest.Mock } = {}) {
      return {
        assignChecklist: jest.fn(async (_checklistId: string, _organizationId: string, input: { userId: string }) => ({
          id: `instance-${input.userId}`,
        })),
        ...overrides,
      } as unknown as import('./checklists.service.js').ChecklistsService;
    }

    it('creates an independent session per learner and audits the batch', async () => {
      const prisma = createPrisma();
      const checklistsService = createChecklistsServiceMock();
      const auditLog = { record: jest.fn(async () => undefined) };
      const service = new ChecklistSessionService(prisma, checklistsService, auditLog as never);

      const result = await service.bulkCreate(organizationId, { checklistId, learnerIds: [learnerA, learnerB], observerId }, actorId);

      expect(result).toMatchObject({ created: 2, skipped: 0, failed: 0 });
      expect(checklistsService.assignChecklist).toHaveBeenCalledTimes(2);
      expect(prisma.checklistSession.create).toHaveBeenCalledTimes(2);
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'checklist_session.bulk_created', metadata: { created: 2, total: 2 } }),
      );
    });

    it('skips a recipient who already has an active assignment without failing the batch', async () => {
      const prisma = createPrisma();
      const checklistsService = createChecklistsServiceMock({
        assignChecklist: jest.fn(async (_checklistId: string, _organizationId: string, input: { userId: string }) => {
          if (input.userId === learnerA) throw new BadRequestException('This user already has an active assignment for this checklist');
          return { id: `instance-${input.userId}` };
        }),
      });
      const service = new ChecklistSessionService(prisma, checklistsService, { record: jest.fn() } as never);

      const result = await service.bulkCreate(organizationId, { checklistId, learnerIds: [learnerA, learnerB], observerId }, actorId);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.results).toEqual(
        expect.arrayContaining([expect.objectContaining({ learnerId: learnerA, status: 'skipped' })]),
      );
    });

    it('rejects the whole batch up front when the observer is invalid', async () => {
      const prisma = createPrisma({ user: { findFirst: jest.fn(async () => null) } });
      const checklistsService = createChecklistsServiceMock();
      const service = new ChecklistSessionService(prisma, checklistsService, { record: jest.fn() } as never);

      await expect(
        service.bulkCreate(organizationId, { checklistId, learnerIds: [learnerA], observerId }, actorId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(checklistsService.assignChecklist).not.toHaveBeenCalled();
    });
  });

  describe('repeat (PR 292)', () => {
    const checklistId = '88888888-8888-8888-8888-888888888888';
    const learnerId = '99999999-9999-9999-9999-999999999999';

    function createChecklistsServiceMock() {
      return {
        assignChecklist: jest.fn(async () => ({ id: 'new-instance-1' })),
      } as unknown as import('./checklists.service.js').ChecklistsService;
    }

    it('creates a new instance/session pair from a completed session, copying observer/policy/timezone', async () => {
      const prisma = createPrisma({
        checklistSession: {
          findFirst: jest.fn(async () =>
            baseSession({
              status: 'completed',
              locationCapturePolicy: 'required',
              timezone: 'Europe/Moscow',
              instance: { checklistId, userId: learnerId },
            }),
          ),
        },
      });
      const checklistsService = createChecklistsServiceMock();
      const auditLog = { record: jest.fn(async () => undefined) };
      const service = new ChecklistSessionService(prisma, checklistsService, auditLog as never);

      const result = await service.repeat(sessionId, organizationId, actorId, {});

      expect(checklistsService.assignChecklist).toHaveBeenCalledWith(checklistId, organizationId, { userId: learnerId }, actorId);
      expect(prisma.checklistSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ instanceId: 'new-instance-1', observerId, locationCapturePolicy: 'required', timezone: 'Europe/Moscow' }),
        }),
      );
      expect(result.status).toBe('scheduled');
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist_session.repeated' }));
    });

    it('rejects repeating an active (non-terminal) session', async () => {
      const prisma = createPrisma({
        checklistSession: {
          findFirst: jest.fn(async () => baseSession({ status: 'in_progress', instance: { checklistId, userId: learnerId } })),
        },
      });
      const checklistsService = createChecklistsServiceMock();
      const service = new ChecklistSessionService(prisma, checklistsService, { record: jest.fn() } as never);

      await expect(service.repeat(sessionId, organizationId, actorId, {})).rejects.toBeInstanceOf(BadRequestException);
      expect(checklistsService.assignChecklist).not.toHaveBeenCalled();
    });

    it('throws 404 when the session is outside the caller scope', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => null) } });
      const checklistsService = createChecklistsServiceMock();
      const service = new ChecklistSessionService(prisma, checklistsService, { record: jest.fn() } as never);

      await expect(service.repeat(sessionId, organizationId, actorId, {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listParticipants (PR 292)', () => {
    it('scopes an observer lookup to users holding the instructor role, ignoring the learner scope', async () => {
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);

      await service.listParticipants(organizationId, { role: 'observer', page: 1, pageSize: 25 }, { id: { in: ['some-learner'] } });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ memberships: { some: { role: 'instructor', organizationId } } }),
        }),
      );
      const call = (prisma.user.findMany as jest.Mock).mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(call.where).not.toHaveProperty('id');
    });

    it('applies the learner scope for a learner lookup', async () => {
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);
      const learnerScope = { id: { in: ['team-member-1'] } };

      await service.listParticipants(organizationId, { role: 'learner', page: 1, pageSize: 25 }, learnerScope);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining(learnerScope) }),
      );
    });

    it('applies a search filter across name/email', async () => {
      const prisma = createPrisma();
      const service = new ChecklistSessionService(prisma);

      await service.listParticipants(organizationId, { role: 'learner', search: 'ivan', page: 1, pageSize: 25 }, {});

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([expect.objectContaining({ firstName: expect.objectContaining({ contains: 'ivan' }) })]),
          }),
        }),
      );
    });
  });

  describe('list/get result projection (PR 292)', () => {
    const projectedSession = {
      ...baseSession(),
      instance: {
        id: instanceId,
        checklistId: 'checklist-1',
        userId: 'learner-1',
        status: 'completed',
        percentage: 90,
        passed: true,
        scored: true,
        checklist: { id: 'checklist-1', title: 'Onboarding' },
        user: { id: 'learner-1', firstName: 'Ivan', lastName: 'Petrov', email: 'ivan@example.test' },
      },
      observer: { id: observerId, firstName: 'Olga', lastName: 'Ivanova', email: 'olga@example.test' },
    };

    it('projects checklist/learner/observer/result onto each list item', async () => {
      const prisma = createPrisma({ checklistSession: { findMany: jest.fn(async () => [projectedSession]) } });
      const service = new ChecklistSessionService(prisma);

      const result = await service.list(organizationId, { page: 1, pageSize: 25 }, {});

      expect(result.items[0]).toMatchObject({
        checklist: { title: 'Onboarding' },
        learner: { firstName: 'Ivan' },
        observer: { firstName: 'Olga' },
        result: { instanceStatus: 'completed', percentage: 90, passed: true, scored: true },
      });
    });

    it('projects the same shape onto a single get()', async () => {
      const prisma = createPrisma({ checklistSession: { findFirst: jest.fn(async () => projectedSession) } });
      const service = new ChecklistSessionService(prisma);

      const result = await service.get(sessionId, organizationId, {});

      expect(result).toMatchObject({ checklist: { title: 'Onboarding' }, result: { percentage: 90 } });
    });
  });
});
