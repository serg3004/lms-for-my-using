import { ConflictException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { createBulkUsersSchema, createUserSchema, importUsersSchema } from './users.schemas.js';
import { UsersService } from './users.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';

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
