import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UploadModule } from '../upload/upload.module.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';
import { UsersBulkService } from './users-bulk.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule, UploadModule],
  controllers: [UsersController, ProfileController],
  providers: [UsersService, UsersBulkService, ProfileService],
})
export class UsersModule {}
