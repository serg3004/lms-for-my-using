import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UploadModule } from '../upload/upload.module.js';
import { ChecklistDeadlineWorker } from './checklist-deadline.worker.js';
import { ChecklistReviewAccessService } from './checklist-review-access.service.js';
import { ChecklistSessionReminderDelivery } from './checklist-session-reminder-delivery.js';
import { ChecklistSessionReminderWorker } from './checklist-session-reminder.worker.js';
import { ChecklistSessionService } from './checklist-session.service.js';
import { ChecklistWorkplaceSettingsService } from './checklist-workplace-settings.service.js';
import { ChecklistsController } from './checklists.controller.js';
import { ChecklistsService } from './checklists.service.js';
@Module({
  imports: [AuthModule, DatabaseModule, UploadModule],
  controllers: [ChecklistsController],
  providers: [
    ChecklistsService,
    ChecklistReviewAccessService,
    ChecklistWorkplaceSettingsService,
    ChecklistSessionService,
    ChecklistDeadlineWorker,
    ChecklistSessionReminderDelivery,
    ChecklistSessionReminderWorker,
  ],
})
export class ChecklistsModule {}
