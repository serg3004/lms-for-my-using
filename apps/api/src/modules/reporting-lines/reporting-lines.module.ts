import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ReportingLinesController } from './reporting-lines.controller.js';
import { ReportingLinesService } from './reporting-lines.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ReportingLinesController],
  providers: [ReportingLinesService],
  exports: [ReportingLinesService],
})
export class ReportingLinesModule {}
