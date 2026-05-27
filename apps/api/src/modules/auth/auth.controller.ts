import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service.js';
import {
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from './auth.schemas.js';

const bearerPrefix = 'Bearer ';

function parseBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith(bearerPrefix)) {
    throw new UnauthorizedException('Missing bearer token');
  }

  const token = authorizationHeader.slice(bearerPrefix.length).trim();

  if (!token) {
    throw new UnauthorizedException('Missing bearer token');
  }

  return token;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: unknown) {
    const input: LoginInput = loginSchema.parse(body);

    return this.authService.login(input);
  }

  @Post('password-reset/request')
  requestPasswordReset(@Body() body: unknown) {
    const input: PasswordResetRequestInput = passwordResetRequestSchema.parse(body);

    return this.authService.requestPasswordReset(input);
  }

  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() body: unknown) {
    const input: PasswordResetConfirmInput = passwordResetConfirmSchema.parse(body);

    return this.authService.confirmPasswordReset(input);
  }

  @Get('me')
  getCurrentUser(@Headers('authorization') authorizationHeader: string | undefined) {
    const accessToken = parseBearerToken(authorizationHeader);

    return this.authService.getCurrentUser(accessToken);
  }
}
