import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { MaterialMultipartUploadService } from '../modules/course-materials/material-multipart-upload.service.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
try {
  const result = await app.get(MaterialMultipartUploadService).cleanupExpired(process.argv[2] !== '--execute');
  console.log(JSON.stringify(result));
} finally {
  await app.close();
}
