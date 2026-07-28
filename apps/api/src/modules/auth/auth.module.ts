import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthLogoutAllController } from './auth.logout-all.controller.js';
import { AuthSessionStore } from './auth.session-store.js';
import { OrganizationScopeGuard } from './organization-scope.guard.js';
import { RolesGuard } from './roles.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  controllers: [AuthController, AuthLogoutAllController],
  providers: [AuthGuard, AuthService, AuthSessionStore, OrganizationScopeGuard, Reflector, RolesGuard],
  exports: [AuthGuard, AuthService, AuthSessionStore, OrganizationScopeGuard, RolesGuard],
})
export class AuthModule {}
