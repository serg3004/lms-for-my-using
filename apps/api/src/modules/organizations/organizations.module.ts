import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UploadModule } from '../upload/upload.module.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  imports: [AuthModule, UploadModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
