import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { createUserSchema, CreateUserInput } from './users.schemas.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers() {
    return this.usersService.listUsers();
  }

  @Get(':id')
  getUser(@Param('id') userId: string) {
    return this.usersService.getUser(userId);
  }

  @Post()
  createUser(@Body() body: unknown) {
    const input: CreateUserInput = createUserSchema.parse(body);

    return this.usersService.createUser(input);
  }
}
