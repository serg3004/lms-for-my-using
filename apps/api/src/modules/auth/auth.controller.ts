import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';

import {
  AuthCookieResponse,
  AuthHeaders,
  assertValidCsrf,
  clearAuthCookies,
  createCsrfToken,
  resolveAccessToken,
  setAuthCookies,
} from './auth.cookies.js';
import { AuthService } from './auth.service.js';
import {
  LoginInput,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from './auth.schemas.js';

type AuthRequest = {
  headers: AuthHeaders;
  method?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: AuthCookieResponse) {
    const input: LoginInput = loginSchema.parse(body);
    const result = await this.authService.login(input);
    const csrfToken = createCsrfToken();

    setAuthCookies(response, result.accessToken, csrfToken);

    return {
      ...result,
      csrfToken,
    };
  }

  @Post('logout')
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthCookieResponse) {
    const accessToken = resolveAccessToken(request.headers);

    assertValidCsrf(request.headers, request.method, accessToken.source);
    await this.authService.getCurrentUser(accessToken.token);
    clearAuthCookies(response);

    return this.authService.logout();
  }

  @Post('password-reset/request')
  requestPasswordReset(@Body() body: unknown) {
    passwordResetRequestSchema.parse(body);

    return this.authService.requestPasswordReset();
  }

  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() body: unknown) {
    passwordResetConfirmSchema.parse(body);

    return this.authService.confirmPasswordReset();
  }

  @Get('me')
  getCurrentUser(@Req() request: AuthRequest) {
    const accessToken = resolveAccessToken(request.headers);

    return this.authService.getCurrentUser(accessToken.token);
  }
}
