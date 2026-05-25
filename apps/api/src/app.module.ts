import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';

@Module({
  imports: [DatabaseModule, HealthModule, OrganizationsModule],
})
export class AppModule {}
