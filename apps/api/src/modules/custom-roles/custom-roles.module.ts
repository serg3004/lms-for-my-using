import { Module } from '@nestjs/common';

import { CustomRolesService } from './custom-roles.service.js';

@Module({
  providers: [CustomRolesService],
  exports: [CustomRolesService],
})
export class CustomRolesModule {}
