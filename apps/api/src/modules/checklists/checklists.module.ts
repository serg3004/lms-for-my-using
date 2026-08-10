import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ChecklistsController } from './checklists.controller.js';
import { ChecklistsService } from './checklists.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ChecklistsController],
  providers: [ChecklistsService],
})
export class ChecklistsModule {}
