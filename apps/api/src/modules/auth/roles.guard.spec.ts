import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedRequest } from './auth.guard';
import { RolesGuard } from './roles.guard';

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

function createContext(request: AuthenticatedRequest, handler = () => undefined) {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function createReflector(roles: string[] | undefined) {
  return {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows a user with an allowed membership role', async () => {
    const queries: unknown[] = [];
    const prisma = {
      membership: {
        findFirst: async (query: unknown) => {
          queries.push(query);

          return { id: '33333333-3333-3333-3333-333333333333' };
        },
      },
    } as unknown as PrismaService;
    const request: AuthenticatedRequest = {
      headers: {},
      currentUser,
    };

    const result = await new RolesGuard(prisma, createReflector(['admin'])).canActivate(createContext(request));

    expect(result).toBe(true);
    expect(queries).toHaveLength(1);
  });

  it('rejects a user without an allowed membership role', async () => {
    const prisma = {
      membership: {
        findFirst: async () => null,
      },
    } as unknown as PrismaService;
    const request: AuthenticatedRequest = {
      headers: {},
      currentUser,
    };

    await expect(new RolesGuard(prisma, createReflector(['admin'])).canActivate(createContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects requests without current user when roles are required', async () => {
    const prisma = {
      membership: {
        findFirst: async () => null,
      },
    } as unknown as PrismaService;
    const request: AuthenticatedRequest = { headers: {} };

    await expect(new RolesGuard(prisma, createReflector(['admin'])).canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
