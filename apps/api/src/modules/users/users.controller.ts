import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { createUserSchema, CreateUserInput } from './users.schemas.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersRead)
  listUsers(@Req() request: AuthenticatedRequest) {
    return this.usersService.listUsers(request.currentUser!.organizationId);
  }

  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersRead)
  getUser(@Param('id') userId: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.getUser(userId, request.currentUser!.organizationId);
  }

  @Post()
  createUser(@Body() body: unknown) {
    const input: CreateUserInput = createUserSchema.parse(body);

    return this.usersService.createUser(input);
  }
}
