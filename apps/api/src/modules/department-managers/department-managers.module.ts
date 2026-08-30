import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DepartmentManagersController } from './department-managers.controller.js';
import { DepartmentManagersService } from './department-managers.service.js';

@Module({
  imports: [AuthModule],
  controllers: [DepartmentManagersController],
  providers: [DepartmentManagersService],
})
export class DepartmentManagersModule {}
