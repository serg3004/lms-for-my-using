import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthGuard, AuthService, Reflector, RolesGuard],
  exports: [AuthGuard, AuthService, RolesGuard],
})
export class AuthModule {}
