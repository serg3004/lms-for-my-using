import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OrgExternalReferencesController } from './org-external-references.controller.js';
import { OrgExternalReferencesService } from './org-external-references.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OrgExternalReferencesController],
  providers: [OrgExternalReferencesService],
})
export class OrgExternalReferencesModule {}
