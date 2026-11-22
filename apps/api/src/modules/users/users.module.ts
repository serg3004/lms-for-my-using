import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UploadModule } from '../upload/upload.module.js';
import { UserFieldsModule } from '../user-fields/public.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';
import { TelegramDeliveryService } from './telegram-delivery.service.js';
import { TelegramWebhookController } from './telegram-webhook.controller.js';
import { UsersBulkService } from './users-bulk.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule, UploadModule, UserFieldsModule],
  controllers: [UsersController, ProfileController, TelegramWebhookController],
  providers: [UsersService, UsersBulkService, ProfileService, TelegramDeliveryService],
})
export class UsersModule {}
