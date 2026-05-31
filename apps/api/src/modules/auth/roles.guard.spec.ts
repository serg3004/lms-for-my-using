import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../database/prisma.service.js';
import { AuthenticatedRequest } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { UserRole } from './roles.js';

const currentUser = {
  id: '22222222-2222-2222-2222-222222222222',
  organizationId: '11111111-1111-1111-1111-111111111111',
  email: 'user@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  middleName: null,
  position: 'Instructor',
  shift: 'Day',
  phone: null,
  status: 'active',
  locale: 'ru',
  timezone: 'Asia/Almaty',
} as const;

type MembershipFindManyArgs = {
  where: {
    organizationId: string;
    userId: string;
  };
  select: {
    role: true;
  };
};

function createContext(request: AuthenticatedRequest, handler = () => undefined) {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function createReflector(roles: UserRole[] | undefined) {
  return {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
}

function createPrisma(roles: UserRole[]) {
  const queries: MembershipFindManyArgs[] = [];
  const prisma = {
    membership: {
      findMany: async (query: MembershipFindManyArgs) => {
        queries.push(query);

        return roles.map((role) => ({ role }));
      },
    },
  } as unknown as PrismaService;

  return {
    prisma,
    queries,
  };
}

describe('RolesGuard', () => {
  it('allows a user with an allowed membership role', async () => {
    const { prisma, queries } = createPrisma(['admin']);
    const request: AuthenticatedRequest = {
      headers: {},
      currentUser,
    };

    const result = await new RolesGuard(prisma, createReflector(['admin'])).canActivate(createContext(request));

    expect(result).toBe(true);
    expect(queries).toEqual([
      {
        where: {
          organizationId: currentUser.organizationId,
          userId: currentUser.id,
        },
        select: { role: true },
      },
    ]);
  });

  it('reuses membership roles cached on the request', async () => {
    const { prisma, queries } = createPrisma(['manager']);
    const request: AuthenticatedRequest = {
      headers: {},
      currentUser,
    };

    await expect(new RolesGuard(prisma, createReflector(['manager'])).canActivate(createContext(request))).resolves.toBe(true);
    await expect(new RolesGuard(prisma, createReflector(['admin', 'manager'])).canActivate(createContext(request))).resolves.toBe(true);

    expect(queries).toHaveLength(1);
  });

  it('skips membership lookup when no roles are required', async () => {
    const { prisma, queries } = createPrisma(['admin']);
    const request: AuthenticatedRequest = {
      headers: {},
      currentUser,
    };

    const result = await new RolesGuard(prisma, createReflector(undefined)).canActivate(createContext(request));

    expect(result).toBe(true);
    expect(queries).toHaveLength(0);
  });

  it('rejects a user without an allowed membership role', async () => {
    const { prisma } = createPrisma(['learner']);
    const request: AuthenticatedRequest = {
      headers: {},
      currentUser,
    };

    await expect(new RolesGuard(prisma, createReflector(['admin'])).canActivate(createContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects requests without current user when roles are required', async () => {
    const { prisma } = createPrisma([]);
    const request: AuthenticatedRequest = { headers: {} };

    await expect(new RolesGuard(prisma, createReflector(['admin'])).canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
