import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CustomRolesController } from './custom-roles.controller.js';
import { MePermissionsController } from './me-permissions.controller.js';
import { CustomRolesService } from './custom-roles.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CustomRolesController, MePermissionsController],
  providers: [CustomRolesService],
  exports: [CustomRolesService],
})
export class CustomRolesModule {}
