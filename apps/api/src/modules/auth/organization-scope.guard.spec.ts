import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticatedRequest } from './auth.guard';
import { OrganizationScopeGuard } from './organization-scope.guard';

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
  roles: ['learner'],
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

function createReflector(source: { location: 'body' | 'param'; name: string } | undefined) {
  return {
    getAllAndOverride: () => source,
  } as unknown as Reflector;
}

describe('OrganizationScopeGuard', () => {
  it('allows a request inside the current user organization', () => {
    const request: AuthenticatedRequest = {
      headers: {},
      params: { id: currentUser.organizationId },
      currentUser,
    };

    const result = new OrganizationScopeGuard(createReflector({ location: 'param', name: 'id' })).canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it('rejects a request for another organization', () => {
    const request: AuthenticatedRequest = {
      headers: {},
      params: { id: '33333333-3333-3333-3333-333333333333' },
      currentUser,
    };

    expect(() =>
      new OrganizationScopeGuard(createReflector({ location: 'param', name: 'id' })).canActivate(createContext(request)),
    ).toThrow(ForbiddenException);
  });

  it('rejects scoped requests without current user', () => {
    const request: AuthenticatedRequest = {
      headers: {},
      params: { id: currentUser.organizationId },
    };

    expect(() =>
      new OrganizationScopeGuard(createReflector({ location: 'param', name: 'id' })).canActivate(createContext(request)),
    ).toThrow(UnauthorizedException);
  });
});
