import { ConflictException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { createBulkUsersSchema, createUserSchema } from './users.schemas.js';
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
