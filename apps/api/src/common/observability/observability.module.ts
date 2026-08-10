import { Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller.js';
import { DatabaseModule } from '../../database/database.module.js';

@Module({ imports: [DatabaseModule], controllers: [MetricsController] })
export class ObservabilityModule {}
