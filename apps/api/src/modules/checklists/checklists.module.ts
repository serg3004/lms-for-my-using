import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ManagerTeamScopeModule } from '../manager-team-scope/manager-team-scope.module.js';
import { UploadModule } from '../upload/upload.module.js';
import { ChecklistDeadlineWorker } from './checklist-deadline.worker.js';
import { ChecklistReviewAccessService } from './checklist-review-access.service.js';
import { ChecklistsController } from './checklists.controller.js';
import { ChecklistsService } from './checklists.service.js';
@Module({
  imports: [AuthModule, DatabaseModule, ManagerTeamScopeModule, UploadModule],
  controllers: [ChecklistsController],
  providers: [ChecklistsService, ChecklistReviewAccessService, ChecklistDeadlineWorker],
})
export class ChecklistsModule {}
