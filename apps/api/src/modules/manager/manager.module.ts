import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ManagerController } from './manager.controller.js';
import { ManagerService } from './manager.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ManagerController],
  providers: [ManagerService],
})
export class ManagerModule {}
