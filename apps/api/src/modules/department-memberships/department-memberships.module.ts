import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DepartmentMembershipsController } from './department-memberships.controller.js';
import { DepartmentMembershipsService } from './department-memberships.service.js';

@Module({
  imports: [AuthModule],
  controllers: [DepartmentMembershipsController],
  providers: [DepartmentMembershipsService],
})
export class DepartmentMembershipsModule {}
