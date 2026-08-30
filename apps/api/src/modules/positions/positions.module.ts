import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { LegacyPositionMigrationService } from './legacy-position-migration.service.js';
import { PositionsController } from './positions.controller.js';
import { PositionsService } from './positions.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PositionsController],
  providers: [PositionsService, LegacyPositionMigrationService],
  exports: [PositionsService, LegacyPositionMigrationService],
})
export class PositionsModule {}
