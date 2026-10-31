import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, RolesGuard, Roles, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { ChecklistFoldersService } from './checklist-folders.service.js';
import { createChecklistFolderSchema, updateChecklistFolderSchema } from './checklists.schemas.js';

/** PR 395: checklist folders. Same roles as the checklists themselves; the service decides per folder who sees and who manages it. */
@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class ChecklistFoldersController {
  constructor(private readonly folders: ChecklistFoldersService) {}

  @Get('checklist-folders')
  @Roles(...rolePolicies.checklistsRead)
  list(@Req() request: AuthenticatedRequest) {
    return this.folders.list(request.currentUser!.organizationId, request.currentUser!);
  }

  @Post('checklist-folders')
  @Roles(...rolePolicies.checklistsCreate)
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.folders.create(request.currentUser!.organizationId, request.currentUser!, createChecklistFolderSchema.parse(body));
  }

  @Patch('checklist-folders/:id')
  @Roles(...rolePolicies.checklistsCreate)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.folders.update(id, request.currentUser!.organizationId, request.currentUser!, updateChecklistFolderSchema.parse(body));
  }

  @Get('checklist-folders/:id/delete-impact')
  @Roles(...rolePolicies.checklistsCreate)
  deleteImpact(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) {
    return this.folders.deleteImpact(id, request.currentUser!.organizationId, request.currentUser!);
  }

  @Delete('checklist-folders/:id')
  @Roles(...rolePolicies.checklistsCreate)
  remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) {
    return this.folders.remove(id, request.currentUser!.organizationId, request.currentUser!);
  }
}
