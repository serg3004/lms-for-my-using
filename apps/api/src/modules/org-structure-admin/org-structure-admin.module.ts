import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrgStructureAdminController } from './org-structure-admin.controller.js';
import { OrgStructureAdminService } from './org-structure-admin.service.js';

@Module({ imports: [AuthModule], controllers: [OrgStructureAdminController], providers: [OrgStructureAdminService] })
export class OrgStructureAdminModule {}
