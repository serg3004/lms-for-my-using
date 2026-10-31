import { CourseMaterialsModule } from '../course-materials/course-materials.module.js';
import { UploadModule } from '../upload/upload.module.js';
import { LongreadFilesService } from './longread-files.service.js';
import { LongreadFilesController } from './longread-files.controller.js';
import { LongreadReaderService } from './longread-reader.service.js';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { LongreadVersionsService } from './longread-versions.service.js';
import { LongreadsController } from './longreads.controller.js';
import { LongreadsService } from './longreads.service.js';

@Module({
  imports: [AuthModule, CourseMaterialsModule, UploadModule],
  controllers: [LongreadsController, LongreadFilesController],
  providers: [LongreadFilesService, LongreadsService, LongreadVersionsService, LongreadReaderService],
  exports: [LongreadsService],
})
export class LongreadsModule {}
