import { UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { currentUserSchema, loginResponseSchema, loginSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { signJwt } from './auth.tokens.js';
import { hashPassword } from './passwords.js';

const jwtSecret = '0123456789abcdef0123456789abcdef';

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
};

type PrismaUserFindFirstArgs = {
  where: Record<string, unknown>;
  select: Record<string, unknown>;
};

type PrismaMembershipFindManyArgs = {
  where: Record<string, unknown>;
  select: Record<string, unknown>;
  orderBy: Record<string, unknown>;
};

type UserRole = 'learner' | 'instructor' | 'manager' | 'admin';

type SessionRecord = { id: string };

type PrismaMock = {
  user: {
    findFirst: (args: PrismaUserFindFirstArgs) => Promise<typeof currentUser | null>;
  };
  membership: {
    findMany: (args: PrismaMembershipFindManyArgs) => Promise<Array<{ role: UserRole }>>;
  };
  session: {
    findFirst: (args: { where: Record<string, unknown> }) => Promise<SessionRecord | null>;
  };
};

function createAuthService(
  userResult: typeof currentUser | null = currentUser,
  sessionResult: SessionRecord | null = { id: 'session-id' },
) {
  const findFirstCalls: PrismaUserFindFirstArgs[] = [];
  const membershipFindManyCalls: PrismaMembershipFindManyArgs[] = [];
  const sessionFindFirstCalls: unknown[] = [];
  const prisma: PrismaMock = {
    user: {
      findFirst: async (args) => {
        findFirstCalls.push(args);

        return userResult;
      },
    },
    membership: {
      findMany: async (args) => {
        membershipFindManyCalls.push(args);

        return [{ role: 'learner' }, { role: 'instructor' }];
      },
    },
    session: {
      findFirst: async (args) => {
        sessionFindFirstCalls.push(args);

        return sessionResult;
      },
    },
  };

  return {
    authService: new AuthService(prisma as unknown as PrismaService),
    findFirstCalls,
    membershipFindManyCalls,
    sessionFindFirstCalls,
  };
}

describe('Auth validation', () => {
  it('accepts valid login input', () => {
    const input = loginSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      email: 'USER@Example.com',
      password: 'secret-password',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      password: 'secret-password',
    });
  });

  it('accepts organization slug login input', () => {
    const input = loginSchema.parse({
      organizationId: 'Demo-Company',
      email: 'USER@Example.com',
      password: 'secret-password',
    });

    expect(input).toEqual({
      organizationId: 'demo-company',
      email: 'user@example.com',
      password: 'secret-password',
    });
  });

  it('accepts current user with position, shift, and roles', () => {
    const parsedCurrentUser = currentUserSchema.parse({
      ...currentUser,
      roles: ['learner', 'instructor'],
    });

    expect(parsedCurrentUser.position).toBe('Instructor');
    expect(parsedCurrentUser.shift).toBe('Day');
    expect(parsedCurrentUser.roles).toEqual(['learner', 'instructor']);
  });

  it('accepts login response with bearer token', () => {
    const response = loginResponseSchema.parse({
      accessToken: 'token',
      tokenType: 'Bearer',
      user: {
        ...currentUser,
        roles: ['learner'],
      },
    });

    expect(response.tokenType).toBe('Bearer');
  });

  it('rejects empty login password', () => {
    expect(() =>
      loginSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        email: 'user@example.com',
        password: '',
      }),
    ).toThrow();
  });
});

describe('AuthService current user lookup', () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
      return;
    }

    process.env.JWT_SECRET = originalJwtSecret;
  });

  it('looks up current users by token subject, organization, and email', async () => {
    process.env.JWT_SECRET = jwtSecret;
    const { authService, findFirstCalls, membershipFindManyCalls } = createAuthService();
    const { token } = await signJwt(
      {
        sub: currentUser.id,
        organizationId: currentUser.organizationId,
        email: currentUser.email,
      },
      jwtSecret,
    );

    await expect(authService.getCurrentUser(token)).resolves.toEqual({
      ...currentUser,
      roles: ['learner', 'instructor'],
    });
    expect(findFirstCalls).toEqual([
      {
        where: {
          id: currentUser.id,
          organizationId: currentUser.organizationId,
          email: currentUser.email,
          status: 'active',
          deletedAt: null,
        },
        select: expect.objectContaining({
          id: true,
          organizationId: true,
          email: true,
        }),
      },
    ]);
    expect(membershipFindManyCalls).toEqual([
      {
        where: {
          userId: currentUser.id,
          organizationId: currentUser.organizationId,
        },
        select: {
          role: true,
        },
        orderBy: {
          role: 'asc',
        },
      },
    ]);
  });

  it('rejects tokens when the subject does not match an active user', async () => {
    process.env.JWT_SECRET = jwtSecret;
    const mismatchedUserId = '33333333-3333-3333-3333-333333333333';
    const { authService, findFirstCalls, membershipFindManyCalls } = createAuthService(null);
    const { token } = await signJwt(
      {
        sub: mismatchedUserId,
        organizationId: currentUser.organizationId,
        email: currentUser.email,
      },
      jwtSecret,
    );

    await expect(authService.getCurrentUser(token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findFirstCalls[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          id: mismatchedUserId,
          organizationId: currentUser.organizationId,
          email: currentUser.email,
        }),
      }),
    );
    expect(membershipFindManyCalls).toHaveLength(0);
  });

  it('rejects token when session is not found', async () => {
    process.env.JWT_SECRET = jwtSecret;
    const { authService } = createAuthService(currentUser, null);
    const { token } = await signJwt(
      {
        sub: currentUser.id,
        organizationId: currentUser.organizationId,
        email: currentUser.email,
      },
      jwtSecret,
    );

    await expect(authService.getCurrentUser(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('passes session jti and expiry filter to session lookup', async () => {
    process.env.JWT_SECRET = jwtSecret;
    const { authService, sessionFindFirstCalls } = createAuthService();
    const { token } = await signJwt(
      {
        sub: currentUser.id,
        organizationId: currentUser.organizationId,
        email: currentUser.email,
      },
      jwtSecret,
    );

    await authService.getCurrentUser(token);

    expect(sessionFindFirstCalls[0]).toMatchObject({
      where: expect.objectContaining({
        revokedAt: null,
        expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
      }),
    });
  });
});

describe('AuthService login', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const orgSlug = 'demo-company';

  function createLoginPrisma(options: {
    orgResult?: { id: string } | null;
    userResult?: (typeof currentUser & { passwordHash: string }) | null;
    roles?: string[];
  }) {
    const orgDefault = { id: orgId };
    const rolesDefault = ['learner'];

    return {
      organization: {
        findFirst: async () => options.orgResult ?? orgDefault,
      },
      user: {
        findFirst: async () => options.userResult ?? null,
      },
      membership: {
        findMany: async () => (options.roles ?? rolesDefault).map((role) => ({ role })),
      },
      session: {
        create: async () => ({ id: 'session-id' }),
      },
    } as unknown as PrismaService;
  }

  beforeEach(() => {
    process.env.JWT_SECRET = jwtSecret;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('returns access token and user on valid credentials with UUID org id', async () => {
    const password = 'Test1234!';
    const passwordHash = await hashPassword(password);
    const userWithHash = { ...currentUser, passwordHash };
    const prisma = createLoginPrisma({ userResult: userWithHash, roles: ['learner'] });
    const authService = new AuthService(prisma);

    const result = await authService.login({
      organizationId: orgId,
      email: currentUser.email,
      password,
    });

    expect(result.tokenType).toBe('Bearer');
    expect(result.accessToken).toBeTruthy();
    expect(result.user).toMatchObject({ id: currentUser.id, email: currentUser.email, roles: ['learner'] });
  });

  it('returns access token and user on valid credentials with org slug', async () => {
    const password = 'Test1234!';
    const passwordHash = await hashPassword(password);
    const userWithHash = { ...currentUser, passwordHash };
    const prisma = createLoginPrisma({ orgResult: { id: orgId }, userResult: userWithHash, roles: ['admin'] });
    const authService = new AuthService(prisma);

    const result = await authService.login({
      organizationId: orgSlug,
      email: currentUser.email,
      password,
    });

    expect(result.tokenType).toBe('Bearer');
    expect(result.user.roles).toEqual(['admin']);
  });

  it('creates a session record on login', async () => {
    const password = 'Test1234!';
    const passwordHash = await hashPassword(password);
    const userWithHash = { ...currentUser, passwordHash };
    const sessionCreateCalls: unknown[] = [];
    const prisma = {
      organization: { findFirst: async () => ({ id: orgId }) },
      user: { findFirst: async () => userWithHash },
      membership: { findMany: async () => [{ role: 'learner' }] },
      session: {
        create: async (args: unknown) => {
          sessionCreateCalls.push(args);

          return { id: 'session-id' };
        },
      },
    } as unknown as PrismaService;
    const authService = new AuthService(prisma);

    await authService.login({ organizationId: orgId, email: currentUser.email, password });

    expect(sessionCreateCalls).toHaveLength(1);
    expect(sessionCreateCalls[0]).toMatchObject({
      data: expect.objectContaining({
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
        expiresAt: expect.any(Date),
      }),
    });
  });

  it('rejects login when user does not exist', async () => {
    const prisma = createLoginPrisma({ userResult: null });
    const authService = new AuthService(prisma);

    await expect(
      authService.login({ organizationId: orgId, email: 'nobody@example.com', password: 'Test1234!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects login with wrong password', async () => {
    const passwordHash = await hashPassword('correct-password');
    const userWithHash = { ...currentUser, passwordHash };
    const prisma = createLoginPrisma({ userResult: userWithHash });
    const authService = new AuthService(prisma);

    await expect(
      authService.login({ organizationId: orgId, email: currentUser.email, password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects login when org slug does not resolve', async () => {
    const prisma = createLoginPrisma({ orgResult: null });
    const authService = new AuthService(prisma);

    await expect(
      authService.login({ organizationId: 'unknown-slug', email: currentUser.email, password: 'Test1234!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('queries only active non-deleted users on login', async () => {
    const password = 'Test1234!';
    const passwordHash = await hashPassword(password);
    const userWithHash = { ...currentUser, passwordHash };
    const findFirstCalls: unknown[] = [];
    const prisma = {
      organization: { findFirst: async () => ({ id: orgId }) },
      user: {
        findFirst: async (args: unknown) => {
          findFirstCalls.push(args);

          return userWithHash;
        },
      },
      membership: { findMany: async () => [{ role: 'learner' }] },
      session: { create: async () => ({ id: 'session-id' }) },
    } as unknown as PrismaService;
    const authService = new AuthService(prisma);

    await authService.login({ organizationId: orgId, email: currentUser.email, password });

    expect(findFirstCalls[0]).toMatchObject({
      where: expect.objectContaining({
        status: 'active',
        deletedAt: null,
      }),
    });
  });
});

describe('AuthService logout', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = jwtSecret;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('revokes the session matching the token jti', async () => {
    const { token, jti } = await signJwt(
      { sub: currentUser.id, organizationId: currentUser.organizationId, email: currentUser.email },
      jwtSecret,
    );
    const updateManyCalls: unknown[] = [];
    const prisma = {
      session: {
        updateMany: async (args: unknown) => {
          updateManyCalls.push(args);

          return { count: 1 };
        },
      },
    } as unknown as PrismaService;
    const authService = new AuthService(prisma);

    const result = await authService.logout(token);

    expect(result).toEqual({ accepted: true });
    expect(updateManyCalls[0]).toMatchObject({
      where: { jti, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('returns accepted even with an invalid token', async () => {
    const authService = new AuthService({} as unknown as PrismaService);

    await expect(authService.logout('not.a.valid.jwt')).resolves.toEqual({ accepted: true });
  });

  it('returns accepted when no session rows are updated', async () => {
    const { token } = await signJwt(
      { sub: currentUser.id, organizationId: currentUser.organizationId, email: currentUser.email },
      jwtSecret,
    );
    const prisma = {
      session: { updateMany: async () => ({ count: 0 }) },
    } as unknown as PrismaService;
    const authService = new AuthService(prisma);

    await expect(authService.logout(token)).resolves.toEqual({ accepted: true });
  });
});
