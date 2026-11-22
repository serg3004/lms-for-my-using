import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';

import { AuthenticatedAccess, AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { createUserFieldSchema, fieldKeySchema, listUserFieldsQuerySchema, reorderUserFieldsSchema, updateUserFieldSchema } from './user-fields.schemas.js';
import { UserFieldsService } from './user-fields.service.js';

/** PR 499: definitions of custom user fields. The administrator manages them; everyone signed in sees the fields visible to them. */
@Controller('user-fields')
export class UserFieldsController {
  constructor(private readonly fields: UserFieldsService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.userFieldsManage)
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.fields.listDefinitions(request.currentUser!.organizationId, listUserFieldsQuerySchema.parse(query).includeArchived);
  }

  /** The fields a person may see and edit on their own profile. */
  @Get('visible')
  @UseGuards(AuthGuard)
  @AuthenticatedAccess()
  visible(@Req() request: AuthenticatedRequest) {
    return this.fields.definitionsFor(request.currentUser!.organizationId, 'self');
  }

  /** The fields an administrator or a manager may see on other people. */
  @Get('for-users')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersRead)
  forUsers(@Req() request: AuthenticatedRequest) {
    return this.fields.definitionsFor(request.currentUser!.organizationId, request.currentUser!.roles.includes('admin') ? 'admin' : 'manager');
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.userFieldsManage)
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.fields.createDefinition(request.currentUser!.organizationId, createUserFieldSchema.parse(body), request.currentUser!.id);
  }

  @Post('template')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.userFieldsManage)
  applyTemplate(@Req() request: AuthenticatedRequest) {
    return this.fields.applyTemplate(request.currentUser!.organizationId, request.currentUser!.id);
  }

  @Put('order')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.userFieldsManage)
  reorder(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.fields.reorder(request.currentUser!.organizationId, reorderUserFieldsSchema.parse(body).keys, request.currentUser!.id);
  }

  @Patch(':key')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.userFieldsManage)
  update(@Req() request: AuthenticatedRequest, @Param('key') key: string, @Body() body: unknown) {
    return this.fields.updateDefinition(request.currentUser!.organizationId, fieldKeySchema.parse(key), updateUserFieldSchema.parse(body), request.currentUser!.id);
  }

  /** Only an archived field can be deleted; its values go with it. */
  @Delete(':key')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.userFieldsManage)
  remove(@Req() request: AuthenticatedRequest, @Param('key') key: string) {
    return this.fields.deleteDefinition(request.currentUser!.organizationId, fieldKeySchema.parse(key), request.currentUser!.id);
  }

  @Post(':key/archive')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.userFieldsManage)
  archive(@Req() request: AuthenticatedRequest, @Param('key') key: string) {
    return this.fields.setArchived(request.currentUser!.organizationId, fieldKeySchema.parse(key), true, request.currentUser!.id);
  }

  @Post(':key/restore')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.userFieldsManage)
  restore(@Req() request: AuthenticatedRequest, @Param('key') key: string) {
    return this.fields.setArchived(request.currentUser!.organizationId, fieldKeySchema.parse(key), false, request.currentUser!.id);
  }
}
