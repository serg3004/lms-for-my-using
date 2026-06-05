import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UploadService } from './upload.service.js';
import { MAX_UPLOAD_FILE_SIZE_BYTES, validateUploadFile } from './upload.validation.js';

@Controller('upload')
@UseGuards(AuthGuard, RolesGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @Roles(...rolePolicies.courseMaterialsCreate)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    validateUploadFile(file);

    return this.uploadService.uploadFile(file, 'materials');
  }
}
