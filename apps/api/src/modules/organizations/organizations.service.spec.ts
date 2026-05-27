import { ConflictException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { createOrganizationSchema, registerOrganizationSchema } from './organizations.schemas.js';
import { OrganizationsService } from './organizations.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';

function createRegistrationInput() {
  return registerOrganizationSchema.parse({
    organization: {
      name: 'Acme LMS',
      slug: 'acme-lms',
    },
    admin: {
      email: 'ADMIN@Example.com',
      password: 'secret-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
  });
}

describe('Organizations validation', () => {
  it('accepts valid organization input', () => {
    const input = createOrganizationSchema.parse({
      name: 'Acme',
      slug: 'acme',
    });

    expect(input).toEqual({
      name: 'Acme',
      slug: 'acme',
      status: 'active',
      plan: 'trial',
    });
  });

  it('rejects invalid organization slug', () => {
    expect(() =>
      createOrganizationSchema.parse({
        name: 'Acme',
        slug: 'Bad Slug',
      }),
    ).toThrow();
  });

  it('accepts registration input and normalizes admin email', () => {
    const input = createRegistrationInput();

    expect(input.admin.email).toBe('admin@example.com');
    expect(input.organization.status).toBe('active');
    expect(input.organization.plan).toBe('trial');
  });
});

describe('OrganizationsService registration', () => {
  it('creates organization, first admin, and admin membership', async () => {
    const createdMemberships: unknown[] = [];
    const prisma = {
      organization: {
        findFirst: async () => null,
        create: async ({ data }: { data: { name: string; slug: string } }) => ({
          id: organizationId,
          name: data.name,
          slug: data.slug,
          status: 'active',
          plan: 'trial',
        }),
      },
      user: {
        findFirst: async () => null,
        create: async ({ data }: { data: { organizationId: string; email: string; passwordHash: string } }) => ({
          id: 'user-1',
          organizationId: data.organizationId,
          email: data.email,
          passwordHash: data.passwordHash,
          firstName: 'Ada',
          lastName: 'Lovelace',
        }),
      },
      membership: {
        create: async ({ data }: { data: unknown }) => {
          createdMemberships.push(data);

          return { id: 'membership-1' };
        },
      },
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(prisma),
    } as unknown as PrismaService;

    const service = new OrganizationsService(prisma);

    await expect(service.registerOrganization(createRegistrationInput())).resolves.toMatchObject({
      organization: {
        id: organizationId,
        slug: 'acme-lms',
      },
      admin: {
        id: 'user-1',
        organizationId,
        email: 'admin@example.com',
      },
    });
    expect(createdMemberships).toEqual([
      {
        organizationId,
        userId: 'user-1',
        role: 'admin',
      },
    ]);
  });

  it('rejects registration when organization slug already exists', async () => {
    const prisma = {
      organization: {
        findFirst: async () => ({ id: organizationId }),
      },
      user: {
        findFirst: async () => null,
      },
      membership: {
        create: async () => ({ id: 'membership-1' }),
      },
      $transaction: async () => {
        throw new Error('should not create');
      },
    } as unknown as PrismaService;

    const service = new OrganizationsService(prisma);

    await expect(service.registerOrganization(createRegistrationInput())).rejects.toBeInstanceOf(ConflictException);
  });
});
