import { UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { currentUserSchema, loginResponseSchema, loginSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { signJwt } from './auth.tokens.js';

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

type PrismaMock = {
  user: {
    findFirst: jest.Mock;
  };
};

function createAuthService(userResult: typeof currentUser | null = currentUser) {
  const prisma: PrismaMock = {
    user: {
      findFirst: jest.fn().mockResolvedValue(userResult),
    },
  };

  return {
    authService: new AuthService(prisma as unknown as PrismaService),
    prisma,
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

  it('accepts current user with position and shift', () => {
    const parsedCurrentUser = currentUserSchema.parse(currentUser);

    expect(parsedCurrentUser.position).toBe('Instructor');
    expect(parsedCurrentUser.shift).toBe('Day');
  });

  it('accepts login response with bearer token', () => {
    const response = loginResponseSchema.parse({
      accessToken: 'token',
      tokenType: 'Bearer',
      user: currentUser,
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
    const { authService, prisma } = createAuthService();
    const token = signJwt(
      {
        sub: currentUser.id,
        organizationId: currentUser.organizationId,
        email: currentUser.email,
      },
      jwtSecret,
    );

    await expect(authService.getCurrentUser(token)).resolves.toEqual(currentUser);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
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
    });
  });

  it('rejects tokens when the subject does not match an active user', async () => {
    process.env.JWT_SECRET = jwtSecret;
    const mismatchedUserId = '33333333-3333-3333-3333-333333333333';
    const { authService, prisma } = createAuthService(null);
    const token = signJwt(
      {
        sub: mismatchedUserId,
        organizationId: currentUser.organizationId,
        email: currentUser.email,
      },
      jwtSecret,
    );

    await expect(authService.getCurrentUser(token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: mismatchedUserId,
          organizationId: currentUser.organizationId,
          email: currentUser.email,
        }),
      }),
    );
  });
});
