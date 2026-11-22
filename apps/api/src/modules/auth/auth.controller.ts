import { Body, Controller, Delete, Get, Optional, Param, Patch, Post, Put, Req, Res, UnauthorizedException } from '@nestjs/common';

import {
  AuthHeaders,
  assertValidCsrf,
  clearAuthCookies,
  createCsrfToken,
  resolveAccessToken,
  resolveRefreshToken,
  setAuthCookies,
} from './auth.cookies.js';
import type { AuthCookieResponse } from './auth.cookies.js';
import { AuthSessionStore } from './auth.session-store.js';
import { AuthService } from './auth.service.js';
import { refreshReuse } from '../../common/observability/metrics.js';
import { AuthenticatedAccess, PublicAccess } from './roles.js';
import {
  EmployeeLoginInput,
  LoginInput,
  changePasswordSchema,
  employeeLoginSchema,
  identityActivationSchema,
  activationQrSchema,
  loginSchema,
  badgeLoginSchema,
  badgePinSchema,
  qrCodeSchema,
  qrPollSchema,
  invitationAcceptSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  updatePreferencesSchema,
} from './auth.schemas.js';
import type { AuthenticatedRequest } from './auth.guard.js';

type AuthRequest = {
  headers: AuthHeaders & { 'user-agent'?: string | string[] | undefined };
  method?: string;
  ip?: string | undefined;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Optional() private readonly sessionStore?: AuthSessionStore,
   ) {}

  @Post('login')
  @PublicAccess()
  async login(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthCookieResponse) {
    // PR 501: a body with `employeeNumber` is the sign-in without email.
    const isEmployeeLogin = typeof body === 'object' && body !== null && 'employeeNumber' in body;
    const input: LoginInput | EmployeeLoginInput = isEmployeeLogin ? employeeLoginSchema.parse(body) : loginSchema.parse(body);
    const userAgent = request.headers['user-agent'];
    const result = await this.authService.login(input, { userAgent: typeof userAgent === 'string' ? userAgent : undefined, ip: request.ip });
    const csrfToken = createCsrfToken();

    setAuthCookies(response, result.accessToken, csrfToken, result.refreshToken);

    return {
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      user: result.user,
      csrfToken,
    };
  }

  /** PR 505: a device without a password asks for a sign-in and shows the answer as a QR. */
  @Post('qr/start')
  @PublicAccess()
  qrStart(@Req() request: AuthRequest) {
    const userAgent = request.headers['user-agent'];
    return this.authService.qrStart({ userAgent: typeof userAgent === 'string' ? userAgent : undefined, ip: request.ip });
  }

  /** The device asks whether the phone decided; its secret is in the body, never in a URL. */
  @Post('qr/status')
  @PublicAccess()
  async qrStatus(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthCookieResponse) {
    const { pollToken } = qrPollSchema.parse(body);
    const userAgent = request.headers['user-agent'];
    const result = await this.authService.qrStatus(pollToken, { userAgent: typeof userAgent === 'string' ? userAgent : undefined, ip: request.ip });
    if (result.status !== 'approved') return { status: result.status };
    const csrfToken = createCsrfToken();
    setAuthCookies(response, result.accessToken, csrfToken, result.refreshToken);
    return { status: result.status, accessToken: result.accessToken, tokenType: result.tokenType, user: result.user, csrfToken };
  }

  @Post('qr/inspect')
  @AuthenticatedAccess()
  qrInspect(@Req() request: AuthRequest, @Body() body: unknown) {
    const accessToken = resolveAccessToken(request.headers);
    assertValidCsrf(request.headers, request.method, accessToken.source);
    return this.authService.qrInspect(accessToken.token, qrCodeSchema.parse(body).code);
  }

  @Post('qr/approve')
  @AuthenticatedAccess()
  qrApprove(@Req() request: AuthRequest, @Body() body: unknown) {
    const accessToken = resolveAccessToken(request.headers);
    assertValidCsrf(request.headers, request.method, accessToken.source);
    return this.authService.qrDecide(accessToken.token, qrCodeSchema.parse(body).code, 'approved');
  }

  @Post('qr/deny')
  @AuthenticatedAccess()
  qrDeny(@Req() request: AuthRequest, @Body() body: unknown) {
    const accessToken = resolveAccessToken(request.headers);
    assertValidCsrf(request.headers, request.method, accessToken.source);
    return this.authService.qrDecide(accessToken.token, qrCodeSchema.parse(body).code, 'denied');
  }

  /** PR 506: a scan of the badge, then the PIN. The answer is "a PIN is needed", a kiosk session, or one refusal for everything else. */
  @Post('badge/login')
  @PublicAccess()
  async badgeLogin(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthCookieResponse) {
    const { token, pin } = badgeLoginSchema.parse(body);
    const userAgent = request.headers['user-agent'];
    const result = await this.authService.badgeLogin(token, pin, { userAgent: typeof userAgent === 'string' ? userAgent : undefined, ip: request.ip });
    if (result.status !== 'ok') return { status: result.status };
    const csrfToken = createCsrfToken();
    setAuthCookies(response, result.accessToken, csrfToken, result.refreshToken);
    return { status: result.status, accessToken: result.accessToken, tokenType: result.tokenType, user: result.user, csrfToken };
  }

  @Post('refresh')
  @PublicAccess()
  async refresh(@Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthCookieResponse) {
    const refreshToken = resolveRefreshToken(request.headers);

    if (!refreshToken || !this.sessionStore) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const session = await this.sessionStore.consumeRefreshSession(refreshToken);

    if (!session) {
      refreshReuse.inc();
      clearAuthCookies(response);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const result = await this.authService.refreshSession(session.id, session.userId, session.organizationId);
    const csrfToken = createCsrfToken();

    setAuthCookies(response, result.accessToken, csrfToken, result.refreshToken);

    return { accessToken: result.accessToken, csrfToken, tokenType: result.tokenType };
  }

  @Post('logout')
  @AuthenticatedAccess()
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthCookieResponse) {
    const accessToken = resolveAccessToken(request.headers);

    assertValidCsrf(request.headers, request.method, accessToken.source);
    clearAuthCookies(response);

    return this.authService.logout(accessToken.token);
  }

  @Post('logout-all')
  @AuthenticatedAccess()
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

  @Post(['password-reset/request', 'reset-password-request'])
  @PublicAccess()
  requestPasswordReset(@Body() body: unknown) {
    const input = passwordResetRequestSchema.parse(body);
    return this.authService.requestPasswordReset(input);
  }

  @Post(['password-reset/confirm', 'reset-password'])
  @PublicAccess()
  confirmPasswordReset(@Body() body: unknown) {
    const input = passwordResetConfirmSchema.parse(body);
    return this.authService.confirmPasswordReset(input);
  }

  @Post('activate/qr')
  @PublicAccess()
  inspectActivationQr(@Body() body: unknown) {
    return this.authService.inspectActivationQr(activationQrSchema.parse(body));
  }

  @Post('activate')
  @PublicAccess()
  activateByIdentity(@Body() body: unknown) {
    const input = identityActivationSchema.parse(body);
    return this.authService.activateByIdentity(input);
  }

  @Post('invitation/accept')
  @PublicAccess()
  acceptInvitation(@Body() body: unknown) {
    const input = invitationAcceptSchema.parse(body);
    return this.authService.acceptInvitation(input);
  }

  @Post('change-password')
  @AuthenticatedAccess()
  changePassword(@Req() request: AuthRequest, @Body() body: unknown) {
    const accessToken = resolveAccessToken(request.headers);
    assertValidCsrf(request.headers, request.method, accessToken.source);
    const input = changePasswordSchema.parse(body);
    return this.authService.changePassword(accessToken.token, input);
  }

  @Get('me/sessions')
  @AuthenticatedAccess()
  listOwnSessions(@Req() request: AuthRequest) {
    return this.authService.listOwnSessions(resolveAccessToken(request.headers).token);
  }

  @Delete('me/sessions/:id')
  @AuthenticatedAccess()
  revokeOwnSession(@Req() request: AuthRequest, @Param('id') sessionId: string) {
    const accessToken = resolveAccessToken(request.headers);
    assertValidCsrf(request.headers, request.method, accessToken.source);
    return this.authService.revokeOwnSession(accessToken.token, sessionId);
  }

  @Get('me/badge')
  @AuthenticatedAccess()
  ownBadge(@Req() request: AuthRequest) {
    return this.authService.ownBadgeState(resolveAccessToken(request.headers).token);
  }

  @Post('me/badge/lost')
  @AuthenticatedAccess()
  reportBadgeLost(@Req() request: AuthRequest) {
    const accessToken = resolveAccessToken(request.headers);
    assertValidCsrf(request.headers, request.method, accessToken.source);
    return this.authService.reportOwnBadgeLost(accessToken.token);
  }

  @Put('me/badge/pin')
  @AuthenticatedAccess()
  changeBadgePin(@Req() request: AuthRequest, @Body() body: unknown) {
    const accessToken = resolveAccessToken(request.headers);
    assertValidCsrf(request.headers, request.method, accessToken.source);
    return this.authService.changeOwnBadgePin(accessToken.token, badgePinSchema.parse(body).pin);
  }

  @Get('me')
  @AuthenticatedAccess()
  getCurrentUser(@Req() request: AuthRequest) {
    const accessToken = resolveAccessToken(request.headers);

    return this.authService.getCurrentUser(accessToken.token);
  }

  @Patch('me/preferences')
  @AuthenticatedAccess()
  updatePreferences(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.authService.updatePreferences(request.currentUser!.id, request.currentUser!.organizationId, updatePreferencesSchema.parse(body));
  }
}
