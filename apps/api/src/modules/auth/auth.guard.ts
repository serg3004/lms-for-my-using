import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { AuthHeaders, assertValidCsrf, resolveAccessToken } from './auth.cookies.js';
import { CurrentUser } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { isKioskRoute, kioskRestrictedBody } from './kiosk-routes.js';

export type AuthenticatedRequest = {
  body?: Record<string, unknown>;
  headers: AuthHeaders;
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, string | undefined>;
  currentUser?: CurrentUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = resolveAccessToken(request.headers);

    assertValidCsrf(request.headers, request.method, accessToken.source);
    request.currentUser = await this.authService.getCurrentUser(accessToken.token);

    // PR 506: a kiosk session (opened by a badge) reaches only the person's own assigned work; everything else is closed here.
    if (request.currentUser.kiosk) {
      const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
      if (!isKioskRoute(request.method, path)) {
        throw new ForbiddenException(kioskRestrictedBody());
      }
    }

    // PR 489: a temporary password opens only the change-password screen (`/auth/*` handlers do not pass through this guard).
    if (request.currentUser.mustChangePassword) {
      throw new ForbiddenException({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Set your own password to continue' } });
    }

    return true;
  }
}
