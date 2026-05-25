import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { CurrentUser } from './auth.schemas.js';
import { AuthService } from './auth.service.js';

const bearerPrefix = 'Bearer ';

export type AuthenticatedRequest = {
  headers: {
    authorization?: string | string[];
  };
  currentUser?: CurrentUser;
};

function parseBearerToken(authorizationHeader: string | string[] | undefined) {
  const authorization = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;

  if (!authorization?.startsWith(bearerPrefix)) {
    throw new UnauthorizedException('Missing bearer token');
  }

  const token = authorization.slice(bearerPrefix.length).trim();

  if (!token) {
    throw new UnauthorizedException('Missing bearer token');
  }

  return token;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = parseBearerToken(request.headers.authorization);

    request.currentUser = await this.authService.getCurrentUser(accessToken);

    return true;
  }
}
