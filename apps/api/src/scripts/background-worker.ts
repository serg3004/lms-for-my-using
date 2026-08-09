import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { loadApiEnv } from '../config/env.js';

loadApiEnv();
process.env['BACKGROUND_JOBS_RUN_WORKER'] = 'true';
const application = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
application.enableShutdownHooks();
