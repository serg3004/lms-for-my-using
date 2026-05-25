import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { OrganizationScopeGuard } from './organization-scope.guard.js';
import { RolesGuard } from './roles.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthGuard, AuthService, OrganizationScopeGuard, Reflector, RolesGuard],
  exports: [AuthGuard, AuthService, OrganizationScopeGuard, RolesGuard],
})
export class AuthModule {}
