import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { createUserSchema, CreateUserInput } from './users.schemas.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard)
  listUsers() {
    return this.usersService.listUsers();
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  getUser(@Param('id') userId: string) {
    return this.usersService.getUser(userId);
  }

  @Post()
  createUser(@Body() body: unknown) {
    const input: CreateUserInput = createUserSchema.parse(body);

    return this.usersService.createUser(input);
  }
}
