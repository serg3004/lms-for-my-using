import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { unrestrictedActor } from '../manager-team-scope/manager-team-scope.js';
import { createBulkUsersSchema, createUserSchema, importUsersSchema, updateUserSchema } from './users.schemas.js';
import { UsersService } from './users.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const userId = '99999999-9999-9999-9999-999999999999';

function createBulkUser(email: string) {
  return {
    email,
    password: 'secret-password',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };
}

describe('Users validation', () => {
  it('accepts valid user input', () => {
    const input = createUserSchema.parse({
      organizationId,
      email: 'USER@Example.com',
      password: 'secret-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
      position: 'Instructor',
      shift: 'Day',
    });

    expect(input).toEqual({
      organizationId,
      email: 'user@example.com',
      password: 'secret-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
      position: 'Instructor',
      shift: 'Day',
      status: 'active',
      locale: 'ru',
      timezone: 'Asia/Almaty',
    });
  });

  it('rejects short user password', () => {
    expect(() =>
      createUserSchema.parse({
        organizationId,
        email: 'user@example.com',
        password: 'short',
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    ).toThrow();
  });

  it('accepts valid bulk user input and normalizes emails', () => {
    const input = createBulkUsersSchema.parse({
      organizationId,
      users: [createBulkUser('FIRST@Example.com'), createBulkUser('second@example.com')],
    });

    expect(input.users.map((user) => user.email)).toEqual(['first@example.com', 'second@example.com']);
  });

  it('rejects duplicate emails in bulk payload', () => {
    expect(() =>
      createBulkUsersSchema.parse({
        organizationId,
        users: [createBulkUser('duplicate@example.com'), createBulkUser('DUPLICATE@example.com')],
      }),
    ).toThrow();
  });

  it('rejects bulk payload over the batch limit', () => {
    expect(() =>
      createBulkUsersSchema.parse({
        organizationId,
        users: Array.from({ length: 51 }, (_, index) => createBulkUser(`user-${index}@example.com`)),
      }),
    ).toThrow();
  });

  it('accepts valid import payload with raw rows', () => {
    const input = importUsersSchema.parse({
      organizationId,
      mode: 'validateOnly',
      users: [createBulkUser('IMPORT@Example.com'), { email: 'bad-email' }],
    });

    expect(input.mode).toBe('validateOnly');
    expect(input.users).toHaveLength(2);
  });
});

describe('UsersService bulk create', () => {
  it('creates users in bulk', async () => {
    const createdUsers: unknown[] = [];
    const prisma = {
      organization: {
        findFirst: async () => ({ id: organizationId }),
      },
      user: {
        findMany: async () => [],
        create: async ({ data }: { data: { email: string; passwordHash: string } }) => {
          const user = {
            id: `${createdUsers.length + 1}`,
            organizationId,
            email: data.email,
            passwordHash: data.passwordHash,
          };

          createdUsers.push(user);

          return user;
        },
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    } as unknown as PrismaService;

    const service = new UsersService(prisma);
    const input = createBulkUsersSchema.parse({
      organizationId,
      users: [createBulkUser('first@example.com'), createBulkUser('second@example.com')],
    });

    await expect(service.createBulkUsers(input)).resolves.toMatchObject({
      organizationId,
      requestedCount: 2,
      createdCount: 2,
      users: [{ email: 'first@example.com' }, { email: 'second@example.com' }],
    });
  });

  it('rejects bulk create when email already exists in database', async () => {
    const prisma = {
      organization: {
        findFirst: async () => ({ id: organizationId }),
      },
      user: {
        findMany: async () => [{ email: 'first@example.com' }],
        create: async () => ({ id: 'should-not-create' }),
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    } as unknown as PrismaService;

    const service = new UsersService(prisma);
    const input = createBulkUsersSchema.parse({
      organizationId,
      users: [createBulkUser('first@example.com')],
    });

    await expect(service.createBulkUsers(input)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('UsersService import', () => {
  it('returns validateOnly report without creating users', async () => {
    let createCalled = false;
    const prisma = {
      organization: {
        findFirst: async () => ({ id: organizationId }),
      },
      user: {
        findMany: async () => [],
        create: async () => {
          createCalled = true;

          return { id: 'should-not-create' };
        },
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    } as unknown as PrismaService;

    const service = new UsersService(prisma);
    const input = importUsersSchema.parse({
      organizationId,
      mode: 'validateOnly',
      users: [createBulkUser('valid@example.com'), createBulkUser('VALID@example.com'), { email: 'bad-email' }],
    });

    await expect(service.importUsers(input)).resolves.toMatchObject({
      organizationId,
      mode: 'validateOnly',
      totalRows: 3,
      createdCount: 0,
      skippedCount: 3,
      errorCount: 3,
      rows: [
        { index: 0, email: 'valid@example.com', status: 'skipped', userId: null },
        { index: 1, email: 'valid@example.com', status: 'skipped', userId: null },
        { index: 2, email: 'bad-email', status: 'skipped', userId: null },
      ],
    });
    expect(createCalled).toBe(false);
  });

  it('creates valid import rows and skips existing emails', async () => {
    const createdUsers: { id: string; email: string }[] = [];
    const prisma = {
      organization: {
        findFirst: async () => ({ id: organizationId }),
      },
      user: {
        findMany: async () => [{ email: 'existing@example.com' }],
        create: async ({ data }: { data: { email: string } }) => {
          const user = {
            id: `${createdUsers.length + 1}`,
            email: data.email,
          };

          createdUsers.push(user);

          return user;
        },
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    } as unknown as PrismaService;

    const service = new UsersService(prisma);
    const input = importUsersSchema.parse({
      organizationId,
      mode: 'create',
      users: [createBulkUser('new@example.com'), createBulkUser('existing@example.com')],
    });

    await expect(service.importUsers(input)).resolves.toMatchObject({
      organizationId,
      mode: 'create',
      totalRows: 2,
      createdCount: 1,
      skippedCount: 1,
      errorCount: 1,
      rows: [
        { index: 0, email: 'new@example.com', status: 'created', userId: '1' },
        { index: 1, email: 'existing@example.com', status: 'skipped', userId: null },
      ],
    });
  });
});

describe('UsersService updateUser role changes', () => {
  const baseUser = { id: userId, email: 'admin@example.com' };
  const actor = unrestrictedActor(organizationId);

  it('rejects demoting the organization\'s last admin', async () => {
    const membershipCount = async () => 0;
    const prisma = {
      user: { findFirst: async () => baseUser },
      membership: {
        findFirst: async () => ({ id: 'membership-1' }),
        count: membershipCount,
      },
      $transaction: async () => {
        throw new Error('$transaction must not run when the last-admin guard rejects the change');
      },
    } as unknown as PrismaService;
    const service = new UsersService(prisma);

    const input = updateUserSchema.parse({
      email: baseUser.email,
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'instructor',
    });

    await expect(service.updateUser(userId, actor, input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows demoting an admin when another admin remains in the organization', async () => {
    const updatedUser = { id: userId, role: 'instructor' };
    const update = async () => ({ id: userId });
    const deleteMany = async () => ({ count: 1 });
    const create = async () => ({});
    const findUniqueOrThrow = async () => updatedUser;
    const prisma = {
      user: {
        findFirst: async () => baseUser,
        update,
        findUniqueOrThrow,
      },
      membership: {
        findFirst: async () => ({ id: 'membership-1' }),
        count: async () => 1,
        deleteMany,
        create,
      },
      $transaction: async (callback: (tx: PrismaService) => Promise<unknown>) => callback(prisma as unknown as PrismaService),
    } as unknown as PrismaService;
    const service = new UsersService(prisma);

    const input = updateUserSchema.parse({
      email: baseUser.email,
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'instructor',
    });

    await expect(service.updateUser(userId, actor, input)).resolves.toEqual(updatedUser);
  });

  it('allows changing role when the user does not currently hold admin', async () => {
    const updatedUser = { id: userId, role: 'manager' };
    const prisma = {
      user: {
        findFirst: async () => baseUser,
        update: async () => ({ id: userId }),
        findUniqueOrThrow: async () => updatedUser,
      },
      membership: {
        findFirst: async () => null,
        deleteMany: async () => ({ count: 1 }),
        create: async () => ({}),
      },
      $transaction: async (callback: (tx: PrismaService) => Promise<unknown>) => callback(prisma as unknown as PrismaService),
    } as unknown as PrismaService;
    const service = new UsersService(prisma);

    const input = updateUserSchema.parse({
      email: baseUser.email,
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'manager',
    });

    await expect(service.updateUser(userId, actor, input)).resolves.toEqual(updatedUser);
  });
});

describe('UsersService updateUserStatus', () => {
  const actor = unrestrictedActor(organizationId);

  function statusHarness(options: { previous?: string; next: string; openSessions?: number; admins?: string[] }) {
    const tx = {
      user: { update: jest.fn(async () => ({ id: userId, status: options.next })) },
      checklistSession: { count: jest.fn(async () => options.openSessions ?? 0) },
      membership: { findMany: jest.fn(async () => (options.admins ?? []).map((id) => ({ userId: id }))) },
      notification: { create: jest.fn(async () => ({ id: 'notice' })) },
      outboxEvent: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      user: { findFirst: async () => ({ id: userId, status: options.previous ?? 'active' }) },
      course: { findMany: async () => [] },
      $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    } as unknown as PrismaService;
    return { tx, service: new UsersService(prisma) };
  }

  it('returns no orphaned courses when the user stays active', async () => {
    const prisma = {
      user: {
        findFirst: async () => ({ id: userId, status: 'active' }),
        update: async () => ({ id: userId, status: 'active' }),
      },
      course: { findMany: async () => [{ id: 'course-1', title: 'Safety', instructors: [{ instructorId: userId }] }] },
      $transaction: async (run: (client: unknown) => Promise<unknown>) => run({ user: { update: async () => ({ id: userId, status: 'active' }) } }),
    } as unknown as PrismaService;
    const service = new UsersService(prisma);

    await expect(service.updateUserStatus(userId, actor, 'active')).resolves.toMatchObject({
      status: 'active',
      orphanedCourses: [],
      observerSessions: 0,
    });
  });

  it('lists courses left without another active instructor when deactivated', async () => {
    const { service } = statusHarness({ next: 'suspended' });
    (service as unknown as { prisma: { course: { findMany: unknown } } }).prisma.course.findMany = async () => [
      { id: 'course-1', title: 'Safety Basics', instructors: [{ instructorId: userId }] },
      { id: 'course-2', title: 'Co-taught', instructors: [{ instructorId: userId }, { instructorId: 'other-instructor' }] },
    ];

    await expect(service.updateUserStatus(userId, actor, 'suspended')).resolves.toMatchObject({
      status: 'suspended',
      orphanedCourses: [{ id: 'course-1', title: 'Safety Basics' }],
    });
  });

  it('notifies each admin once when an observer with open sessions is deactivated (PR 346)', async () => {
    const { tx, service } = statusHarness({ next: 'suspended', openSessions: 3, admins: ['admin-1', 'admin-2', 'admin-1'] });

    await expect(service.updateUserStatus(userId, actor, 'suspended')).resolves.toMatchObject({ observerSessions: 3 });
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
    expect(tx.notification.create).toHaveBeenCalledWith({ data: {
      organizationId, userId: 'admin-1', type: 'checklist_session_observer_deactivated',
      data: { observerId: userId, sessionCount: 3 }, link: `/admin/checklists/sessions?observerId=${userId}`,
    } });
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(2);
  });

  it('does not notify without open sessions, on a repeated status or on activation (PR 346)', async () => {
    const none = statusHarness({ next: 'suspended', openSessions: 0, admins: ['admin-1'] });
    await none.service.updateUserStatus(userId, actor, 'suspended');
    expect(none.tx.notification.create).not.toHaveBeenCalled();

    const repeated = statusHarness({ previous: 'suspended', next: 'suspended', openSessions: 2, admins: ['admin-1'] });
    await expect(repeated.service.updateUserStatus(userId, actor, 'suspended')).resolves.toMatchObject({ observerSessions: 2 });
    expect(repeated.tx.notification.create).not.toHaveBeenCalled();

    const activation = statusHarness({ previous: 'suspended', next: 'active', openSessions: 2, admins: ['admin-1'] });
    await activation.service.updateUserStatus(userId, actor, 'active');
    expect(activation.tx.checklistSession.count).not.toHaveBeenCalled();
    expect(activation.tx.notification.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the user does not exist', async () => {
    const prisma = { user: { findFirst: async () => null } } as unknown as PrismaService;
    const service = new UsersService(prisma);

    await expect(service.updateUserStatus(userId, actor, 'suspended')).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService getObserverSessionImpact', () => {
  it('counts only open sessions of an in-scope user and 404s for others (PR 346)', async () => {
    const count = jest.fn(async () => 4);
    const prisma = { user: { findFirst: async () => ({ id: userId }) }, checklistSession: { count } } as unknown as PrismaService;
    await expect(new UsersService(prisma).getObserverSessionImpact(userId, unrestrictedActor(organizationId))).resolves.toEqual({ observerSessions: 4 });
    expect(count).toHaveBeenCalledWith({ where: { organizationId, observerId: userId, deletedAt: null, status: { in: ['scheduled', 'in_progress', 'paused'] } } });

    const missing = { user: { findFirst: async () => null } } as unknown as PrismaService;
    await expect(new UsersService(missing).getObserverSessionImpact(userId, unrestrictedActor(organizationId))).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService listUsers', () => {
  it('applies an optional status filter to the where clause', async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    const prisma = {
      user: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          capturedWhere = where;
          return [];
        },
        count: async () => 0,
      },
    } as unknown as PrismaService;

    const service = new UsersService(prisma);
    await service.listUsers(unrestrictedActor(organizationId), 1, 20, undefined, 'active');

    expect(capturedWhere).toMatchObject({ organizationId, deletedAt: null, status: 'active' });
  });

  it('omits the status filter when none is given', async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    const prisma = {
      user: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          capturedWhere = where;
          return [];
        },
        count: async () => 0,
      },
    } as unknown as PrismaService;

    const service = new UsersService(prisma);
    await service.listUsers(unrestrictedActor(organizationId), 1, 20);

    expect(capturedWhere).not.toHaveProperty('status');
  });
});
