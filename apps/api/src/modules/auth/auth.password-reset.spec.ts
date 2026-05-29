import { ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';

describe('password reset disabled flow', () => {
  const prisma = {} as PrismaService;
  const authService = new AuthService(prisma);

  it('normalizes password reset request input without exposing account existence', () => {
    const input = passwordResetRequestSchema.parse({
      organizationId: '11111111-1111-4111-8111-111111111111',
      email: ' Learner@Example.COM ',
    });

    expect(input.email).toBe('learner@example.com');
  });

  it('rejects password reset requests while the flow is disabled', () => {
    expect(() => authService.requestPasswordReset()).toThrow(ServiceUnavailableException);
  });

  it('parses strong password reset confirmation input', () => {
    passwordResetConfirmSchema.parse({
      token: 'a'.repeat(32),
      password: 'StrongPass1!',
    });
  });

  it('rejects password reset confirmation while the flow is disabled', () => {
    expect(() => authService.confirmPasswordReset()).toThrow(ServiceUnavailableException);
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
