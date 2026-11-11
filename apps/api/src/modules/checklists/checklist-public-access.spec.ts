import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { ChecklistPublicAccess, GUEST_USER_EMAIL, isEligibleForPublicAccess, markGuestPassesDisabled, newPublicToken, publicAccessOffData } from './checklist-public-access.js';
import { updateChecklistPublicAccessSchema } from './checklists.schemas.js';
import { ChecklistsService } from './checklists.service.js';

const orgId = '11111111-1111-1111-1111-111111111111';
const sheetId = '22222222-2222-2222-2222-222222222222';
const adminActor = { id: '33333333-3333-3333-3333-333333333333', roles: ['admin'] };
const instructorActor = { id: '44444444-4444-4444-4444-444444444444', roles: ['instructor'] };

type Row = {
  id: string; organizationId: string; deletedAt: Date | null; status: string; accessMode: string;
  publicAccess: 'off' | 'registered' | 'everyone'; publicToken: string | null; guestNameRequired: boolean; guestPhotosAllowed: boolean; publicDailyLimit: number;
  publicAccessChangedAt: Date | null; publicAccessChangedBy: string | null;
};

function setup(overrides: Partial<Row> = {}) {
  const row: Row = {
    id: sheetId, organizationId: orgId, deletedAt: null, status: 'published', accessMode: 'free', publicAccess: 'off', publicToken: null,
    guestNameRequired: true, guestPhotosAllowed: false, publicDailyLimit: 200, publicAccessChangedAt: null, publicAccessChangedBy: null, ...overrides,
  };
  const prisma = {
    checklist: {
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) => (where.id === row.id && where.organizationId === row.organizationId && !row.deletedAt ? { ...row } : null),
      updateMany: async ({ where, data }: { where: { publicAccessChangedAt?: Date | null }; data: Partial<Row> }) => {
        if ('publicAccessChangedAt' in where) {
          const expected = where.publicAccessChangedAt?.getTime() ?? null;
          if ((row.publicAccessChangedAt?.getTime() ?? null) !== expected) return { count: 0 };
        }
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    user: { findFirst: async (args: { where: { email?: string } }) => (args.where.email ? null : { id: adminActor.id, firstName: 'Анна', lastName: 'Админова' }) },
    checklistInstance: { findMany: async () => [] },
    checklistInstanceEvent: { createMany: async () => ({ count: 0 }) },
  };
  const record = jest.fn(async () => undefined);
  const helper = new ChecklistPublicAccess(prisma as never, { record } as never);
  return { row, helper, record };
}

describe('ChecklistPublicAccess (PR 464)', () => {
  it('makes tokens of at least 128 bits that differ every time', () => {
    const a = newPublicToken();
    expect(Buffer.from(a, 'base64url').length).toBeGreaterThanOrEqual(16);
    expect(newPublicToken()).not.toBe(a);
  });

  it('only a published free sheet is eligible', () => {
    expect(isEligibleForPublicAccess({ status: 'published', accessMode: 'free' })).toBe(true);
    expect(isEligibleForPublicAccess({ status: 'draft', accessMode: 'free' })).toBe(false);
    expect(isEligibleForPublicAccess({ status: 'archived', accessMode: 'free' })).toBe(false);
    expect(isEligibleForPublicAccess({ status: 'published', accessMode: 'assigned' })).toBe(false);
  });

  it('an administrator enables the entry, gets a token once and the audit entry has no token', async () => {
    const { helper, row, record } = setup();
    const state = await helper.update(orgId, sheetId, adminActor, { access: 'everyone' });
    expect(state.access).toBe('everyone');
    expect(state.token).toBe(row.publicToken);
    expect(state.token).toBeTruthy();
    expect(state.changedBy?.name).toBe('Админова Анна');
    expect(JSON.stringify(record.mock.calls)).not.toContain(row.publicToken as string);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist.public_access.updated' }));
  });

  it('keeps the token while the entry is switched off and on again', async () => {
    const { helper, row } = setup();
    await helper.update(orgId, sheetId, adminActor, { access: 'registered' });
    const first = row.publicToken;
    await helper.update(orgId, sheetId, adminActor, { access: 'off' });
    expect(row.publicToken).toBe(first);
    await helper.update(orgId, sheetId, adminActor, { access: 'everyone' });
    expect(row.publicToken).toBe(first);
  });

  it('an instructor gets 403 on enable and on reissue, and a read without the token', async () => {
    const { helper, row } = setup({ publicAccess: 'everyone', publicToken: 'secret-token' });
    await expect(helper.update(orgId, sheetId, instructorActor, { access: 'off' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(helper.reissue(orgId, sheetId, instructorActor)).rejects.toBeInstanceOf(ForbiddenException);
    const state = await helper.get(orgId, sheetId, instructorActor);
    expect(state.access).toBe('everyone');
    expect(state.hasLink).toBe(true);
    expect(state.token).toBeNull();
    expect(state.changedBy).toBeNull();
    expect(row.publicAccess).toBe('everyone');
  });

  it.each([['draft', 'free'], ['archived', 'free'], ['published', 'assigned']])('cannot enable a %s sheet with %s access', async (status, accessMode) => {
    const { helper, row } = setup({ status, accessMode });
    await expect(helper.update(orgId, sheetId, adminActor, { access: 'everyone' })).rejects.toBeInstanceOf(BadRequestException);
    expect(row.publicAccess).toBe('off');
    await expect(helper.reissue(orgId, sheetId, adminActor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reissue replaces the token so the old one no longer matches', async () => {
    const { helper, row, record } = setup({ publicAccess: 'everyone', publicToken: 'old-token' });
    const state = await helper.reissue(orgId, sheetId, adminActor);
    expect(state.token).not.toBe('old-token');
    expect(row.publicToken).toBe(state.token);
    expect(JSON.stringify(record.mock.calls)).not.toContain(state.token as string);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist.public_access.reissued' }));
  });

  it('answers 409 when the screen is stale and 404 for a missing sheet', async () => {
    const { helper } = setup({ publicAccessChangedAt: new Date('2026-11-01T10:00:00.000Z') });
    await expect(helper.update(orgId, sheetId, adminActor, { access: 'everyone', expectedChangedAt: null })).rejects.toBeInstanceOf(ConflictException);
    await expect(helper.update(orgId, sheetId, adminActor, { access: 'everyone', expectedChangedAt: '2026-11-01T10:00:00.000Z' })).resolves.toBeDefined();
    await expect(helper.get(orgId, '99999999-9999-9999-9999-999999999999', adminActor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a repeated request writes and logs nothing', async () => {
    const { helper, record } = setup({ guestNameRequired: true });
    await helper.update(orgId, sheetId, adminActor, { guestNameRequired: true });
    expect(record).not.toHaveBeenCalled();
  });

  it('guest rules change without touching the stamp or the token', async () => {
    const { helper, row } = setup({ publicAccess: 'everyone', publicToken: 't' });
    await helper.update(orgId, sheetId, adminActor, { guestPhotosAllowed: true, guestNameRequired: false });
    expect(row.guestPhotosAllowed).toBe(true);
    expect(row.guestNameRequired).toBe(false);
    expect(row.publicAccessChangedAt).toBeNull();
    expect(row.publicToken).toBe('t');
  });

  it('a daily limit changes without touching the stamp, and out-of-range values are refused', async () => {
    const { helper, row } = setup({ publicAccess: 'everyone', publicToken: 't' });
    const state = await helper.update(orgId, sheetId, adminActor, { dailyLimit: 50 });
    expect(state.dailyLimit).toBe(50);
    expect(row.publicAccessChangedAt).toBeNull();
    expect(updateChecklistPublicAccessSchema.safeParse({ dailyLimit: 0 }).success).toBe(false);
    expect(updateChecklistPublicAccessSchema.safeParse({ dailyLimit: 10_001 }).success).toBe(false);
  });

  it('the off data stamps who and when', () => {
    const now = new Date();
    expect(publicAccessOffData('u', now)).toEqual({ publicAccess: 'off', publicAccessChangedAt: now, publicAccessChangedBy: 'u' });
  });
});

describe('updateChecklistPublicAccessSchema', () => {
  it('needs at least one setting and rejects unknown fields and values', () => {
    expect(updateChecklistPublicAccessSchema.safeParse({}).success).toBe(false);
    expect(updateChecklistPublicAccessSchema.safeParse({ access: 'anyone' }).success).toBe(false);
    expect(updateChecklistPublicAccessSchema.safeParse({ access: 'off', token: 'x' }).success).toBe(false);
    expect(updateChecklistPublicAccessSchema.safeParse({ access: 'registered', guestPhotosAllowed: false }).success).toBe(true);
  });
});

describe('ChecklistsService.updateChecklist closes the public entry (PR 464)', () => {
  function build(sheet: Record<string, unknown>) {
    const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...sheet, ...data, title: 'Лист', id: sheetId }));
    const record = jest.fn(async () => undefined);
    const prisma = { checklist: { findFirst: async () => sheet, update }, user: { findFirst: async () => null }, checklistInstance: { findMany: async () => [] }, checklistInstanceEvent: { createMany: async () => ({ count: 0 }) } };
    const service = new ChecklistsService(prisma as never, {} as never, { record } as never);
    return { service, update, record };
  }
  const base = { id: sheetId, scoringMode: 'points', scaleLevels: null, accessMode: 'free', status: 'published', pinned: false, publicAccess: 'everyone', feedbackEnabled: true, feedbackRequired: false, feedbackLayout: null };

  it.each([[{ status: 'draft' }], [{ status: 'archived' }], [{ accessMode: 'assigned' }]])('switches it off for %j', async (input) => {
    const { service, update, record } = build(base);
    await service.updateChecklist(sheetId, orgId, input as never, adminActor.id).catch(() => undefined);
    const data = update.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ publicAccess: 'off', publicAccessChangedBy: adminActor.id });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist.public_access.updated', metadata: expect.objectContaining({ access: 'off' }) }));
  });

  it('leaves it alone for an ordinary edit or when it was already off', async () => {
    const first = build(base);
    await first.service.updateChecklist(sheetId, orgId, { title: 'Новое' } as never, adminActor.id).catch(() => undefined);
    expect(first.update.mock.calls[0]?.[0].data).not.toHaveProperty('publicAccess');
    const second = build({ ...base, publicAccess: 'off' });
    await second.service.updateChecklist(sheetId, orgId, { status: 'draft' } as never, adminActor.id).catch(() => undefined);
    expect(second.update.mock.calls[0]?.[0].data).not.toHaveProperty('publicAccess');
  });
});

describe('markGuestPassesDisabled (PR 465)', () => {
  const build = (guest: { id: string } | null, open: Array<{ id: string }>) => {
    const createMany = jest.fn(async () => ({ count: open.length }));
    const findMany = jest.fn(async () => open);
    const db = { user: { findFirst: jest.fn(async () => guest) }, checklistInstance: { findMany }, checklistInstanceEvent: { createMany } };
    return { db, createMany, findMany };
  };

  it('marks each open, not yet marked guest pass of the sheets once', async () => {
    const { db, createMany, findMany } = build({ id: 'guest' }, [{ id: 'i1' }, { id: 'i2' }]);
    await markGuestPassesDisabled(db as never, orgId, [sheetId], 'reissued');
    expect(db.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: orgId, email: GUEST_USER_EMAIL } }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'guest', status: { in: ['assigned', 'in_progress'] }, events: { none: { eventType: 'guest_link_disabled' } } }) }));
    expect(createMany).toHaveBeenCalledWith({ data: [
      { organizationId: orgId, instanceId: 'i1', eventType: 'guest_link_disabled', metadata: { reason: 'reissued' } },
      { organizationId: orgId, instanceId: 'i2', eventType: 'guest_link_disabled', metadata: { reason: 'reissued' } },
    ] });
  });

  it('does nothing without a guest user, without open passes or without sheets', async () => {
    const noGuest = build(null, [{ id: 'i1' }]);
    await markGuestPassesDisabled(noGuest.db as never, orgId, [sheetId], 'switched_off');
    expect(noGuest.createMany).not.toHaveBeenCalled();
    const none = build({ id: 'guest' }, []);
    await markGuestPassesDisabled(none.db as never, orgId, [sheetId], 'switched_off');
    expect(none.createMany).not.toHaveBeenCalled();
    await markGuestPassesDisabled(none.db as never, orgId, [], 'switched_off');
    expect(none.db.user.findFirst).toHaveBeenCalledTimes(1);
  });
});
