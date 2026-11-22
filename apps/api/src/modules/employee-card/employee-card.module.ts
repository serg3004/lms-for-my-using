import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuditLogModule } from '../audit-log/audit-log.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ManagerTeamScopeModule } from '../manager-team-scope/manager-team-scope.module.js';
import { UploadModule } from '../upload/upload.module.js';
import { UsersModule } from '../users/users.module.js';
import { EmployeeCardController } from './employee-card.controller.js';
import { EmployeeCardService } from './employee-card.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, AuditLogModule, ManagerTeamScopeModule, UploadModule, UsersModule],
  controllers: [EmployeeCardController],
  providers: [EmployeeCardService],
})
export class EmployeeCardModule {}
