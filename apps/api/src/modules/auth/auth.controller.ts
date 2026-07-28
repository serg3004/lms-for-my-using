import { Body, Controller, Get, Optional, Post, Req, Res, UnauthorizedException } from '@nestjs/common';

import {
  AuthCookieResponse,
  AuthHeaders,
  assertValidCsrf,
  clearAuthCookies,
  createCsrfToken,
  resolveAccessToken,
  resolveRefreshToken,
  setAuthCookies,
} from './auth.cookies.js';
import { AuthSessionStore } from './auth.session-store.js';
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
  constructor(
    private readonly authService: AuthService,
    @Optional() private readonly sessionStore?: AuthSessionStore,
   ) {}

  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: AuthCookieResponse) {
    const input: LoginInput = loginSchema.parse(body);
    const result = await this.authService.login(input);
    const csrfToken = createCsrfToken();

    setAuthCookies(response, result.accessToken, csrfToken, result.refreshToken);

    return {
      ...result,
      csrfToken,
    };
  }

  @Post('refresh')
  async refresh(@Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthCookieResponse) {
    const refreshToken = resolveRefreshToken(request.headers);

    if (!refreshToken || !this.sessionStore) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const session = await this.sessionStore.findActiveRefreshSession(refreshToken);

    if (!session) {
      clearAuthCookies(response);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const result = await this.authService.refreshSession(session.id, session.userId, session.organizationId);
    const csrfToken = createCsrfToken();

    setAuthCookies(response, result.accessToken, csrfToken, result.refreshToken);

    return { accessToken: result.accessToken, csrfToken, tokenType: result.tokenType };
  }

  @Post('logout')
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthCookieResponse) {
    const accessToken = resolveAccessToken(request.headers);

    assertValidCsrf(request.headers, request.method, accessToken.source);
    clearAuthCookies(response);

    return this.authService.logout(accessToken.token);
  }

  @Post('logout-all')
  async logoutAll(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthCookieResponse,
  ) {
    const accessToken = resolveAccessToken(request.headers);

    assertValidCsrf(request.headers, request.method, accessToken.source);
    clearAuthCookies(response);

    let user: Awaited<ReturnType<AuthService['getCurrentUser']>>;

    try {
      user = await this.authService.getCurrentUser(accessToken.token);
    } catch {
      return { accepted: true } as const;
    }

    await this.sessionStore?.revokeAllUserSessions(user.id, user.organizationId);

    return { accepted: true } as const;
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
