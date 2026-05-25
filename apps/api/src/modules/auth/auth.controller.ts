import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service.js';
import { LoginInput, loginSchema } from './auth.schemas.js';

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

  @Get('me')
  getCurrentUser(@Headers('authorization') authorizationHeader: string | undefined) {
    const accessToken = parseBearerToken(authorizationHeader);

    return this.authService.getCurrentUser(accessToken);
  }
}
