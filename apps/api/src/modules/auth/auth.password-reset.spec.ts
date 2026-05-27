import { PrismaService } from '../../database/prisma.service.js';
import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';

describe('password reset skeleton', () => {
  const prisma = {} as PrismaService;
  const authService = new AuthService(prisma);

  it('accepts password reset requests without exposing account existence', () => {
    const input = passwordResetRequestSchema.parse({
      organizationId: '11111111-1111-4111-8111-111111111111',
      email: ' Learner@Example.COM ',
    });

    expect(authService.requestPasswordReset(input)).toEqual({
      accepted: true,
    });
    expect(input.email).toBe('learner@example.com');
  });

  it('accepts strong password reset confirmation input', () => {
    const input = passwordResetConfirmSchema.parse({
      token: 'a'.repeat(32),
      password: 'StrongPass1!',
    });

    expect(authService.confirmPasswordReset(input)).toEqual({
      accepted: true,
    });
  });

  it('rejects weak password reset confirmation passwords', () => {
    expect(() =>
      passwordResetConfirmSchema.parse({
        token: 'a'.repeat(32),
        password: 'weak',
      }),
    ).toThrow();
  });
});
