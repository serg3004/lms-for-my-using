import { Module } from '@nestjs/common';

import { AuthService } from './auth.service.js';

@Module({
  providers: [AuthService],
})
export class AuthModule {}
