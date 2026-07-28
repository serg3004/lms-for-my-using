import { Controller, Post, Req, Res } from '@nestjs/common';

import {
  AuthCookieResponse,
  AuthHeaders,
  assertValidCsrf,
  clearAuthCookies,
  resolveAccessToken,
} from './auth.cookies.js';
import { AuthService } from './auth.service.js';
import { AuthSessionStore } from './auth.session-store.js';

type AuthRequest = {
  headers: AuthHeaders;
  method?: string;
};

const logoutAccepted = { accepted: true } as const;

@Controller('auth')
export class AuthLogoutAllController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionStore: AuthSessionStore,
  ) {}

  @Post('logout-all')
  async logoutAll(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: AuthCookieResponse,
  ) {
    const accessToken = resolveAccessToken(request.headers);

    assertValidCsrf(request.headers, request.method, accessToken.source);
    clearAuthCookies(response);

    try {
      const user = await this.authService.getCurrentUser(accessToken.token);
      await this.sessionStore.revokeAllUserSessions(user.id, user.organizationId);
    } catch {
      // Invalid or already-revoked sessions keep logout-all idempotent.
    }

    return logoutAccepted;
  }
}
