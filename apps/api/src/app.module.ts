import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MembershipsModule } from './modules/memberships/memberships.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [DatabaseModule, HealthModule, MembershipsModule, OrganizationsModule, UsersModule],
})
export class AppModule {}
