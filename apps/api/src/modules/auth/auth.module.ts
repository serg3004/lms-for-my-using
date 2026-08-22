import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthSessionStore } from './auth.session-store.js';
import { OrganizationScopeGuard } from './organization-scope.guard.js';
import { RolesGuard } from './roles.guard.js';
import { AuthService } from './auth.service.js';
import { PasswordResetDelivery } from './password-reset.js';

@Module({
  controllers: [AuthController],
  providers: [AuthGuard, AuthService, AuthSessionStore, OrganizationScopeGuard, PasswordResetDelivery, Reflector, RolesGuard],
  exports: [AuthGuard, AuthService, AuthSessionStore, OrganizationScopeGuard, RolesGuard],
})
export class AuthModule {}
