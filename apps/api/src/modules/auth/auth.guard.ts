import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { AuthHeaders, assertValidCsrf, resolveAccessToken } from './auth.cookies.js';
import { CurrentUser } from './auth.schemas.js';
import { AuthService } from './auth.service.js';

export type AuthenticatedRequest = {
  body?: Record<string, unknown>;
  headers: AuthHeaders;
  method?: string;
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

    // PR 489: a temporary password opens only the change-password screen (`/auth/*` handlers do not pass through this guard).
    if (request.currentUser.mustChangePassword) {
      throw new ForbiddenException({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Set your own password to continue' } });
    }

    return true;
  }
}
