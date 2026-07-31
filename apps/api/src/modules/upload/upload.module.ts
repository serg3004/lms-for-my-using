import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UploadService } from './upload.service.js';

@Module({
  imports: [AuthModule],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
