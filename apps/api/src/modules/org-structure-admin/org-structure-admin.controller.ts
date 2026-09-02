import { BadRequestException, Body, Controller, Get, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { AuthGuard, Roles, rolePolicies, RolesGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { MAX_CSV_BYTES } from './csv.js';
import { commitImportSchema, historyQuerySchema, previewImportFieldsSchema } from './org-structure-admin.schemas.js';
import { OrgStructureAdminService } from './org-structure-admin.service.js';

@Controller('org-structure')
@UseGuards(AuthGuard, RolesGuard)
export class OrgStructureAdminController {
  constructor(private readonly service: OrgStructureAdminService) {}

  @Post('imports/preview')
  @Roles(...rolePolicies.departmentsWrite)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_CSV_BYTES } }))
  preview(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    if (!file) throw new BadRequestException('CSV file is required');
    const { kind, mode } = previewImportFieldsSchema.parse(body);
    const user = request.currentUser!;
    return this.service.preview(file.buffer, kind, mode, user.organizationId, user.id);
  }

  @Post('imports/commit')
  @Roles(...rolePolicies.departmentsWrite)
  commit(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { token } = commitImportSchema.parse(body); const user = request.currentUser!;
    return this.service.commit(token, user.organizationId, user.id);
  }

  @Get('history')
  @Roles(...rolePolicies.departmentsRead)
  history(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.service.history(request.currentUser!.organizationId, historyQuerySchema.parse(query));
  }
}
