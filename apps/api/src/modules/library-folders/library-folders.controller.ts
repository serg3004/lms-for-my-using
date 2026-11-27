import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { LibraryFoldersService, type LibraryActor } from './library-folders.service.js';
import { bulkLibraryFolderSchema, createLibraryFolderSchema, listLibraryFoldersSchema, updateLibraryFolderSchema } from './library-folders.schemas.js';

const actorOf = (request: AuthenticatedRequest): LibraryActor => {
  const user = request.currentUser!;
  return { organizationId: user.organizationId, id: user.id, roles: user.roles };
};

/** PR 581: folders of the course and assignment lists. The section decides who may manage them (see the service). */
@Controller('library-folders')
@UseGuards(AuthGuard, RolesGuard)
export class LibraryFoldersController {
  constructor(private readonly folders: LibraryFoldersService) {}

  @Get()
  @Roles(...rolePolicies.assignmentsCreate)
  list(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.folders.list(actorOf(request), listLibraryFoldersSchema.parse(query).scope);
  }

  @Post()
  @Roles(...rolePolicies.assignmentsCreate)
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.folders.create(actorOf(request), createLibraryFolderSchema.parse(body));
  }

  @Post('bulk')
  @Roles(...rolePolicies.assignmentsCreate)
  bulk(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.folders.bulk(actorOf(request), bulkLibraryFolderSchema.parse(body));
  }

  @Patch(':id')
  @Roles(...rolePolicies.assignmentsCreate)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.folders.update(actorOf(request), id, updateLibraryFolderSchema.parse(body));
  }

  @Get(':id/delete-impact')
  @Roles(...rolePolicies.assignmentsCreate)
  deleteImpact(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.folders.deleteImpact(actorOf(request), id);
  }

  @Delete(':id')
  @Roles(...rolePolicies.assignmentsCreate)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.folders.remove(actorOf(request), id);
  }
}
