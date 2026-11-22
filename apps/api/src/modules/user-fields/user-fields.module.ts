import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UserFieldsController } from './user-fields.controller.js';
import { UserFieldsService } from './user-fields.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UserFieldsController],
  providers: [UserFieldsService],
  exports: [UserFieldsService],
})
export class UserFieldsModule {}
