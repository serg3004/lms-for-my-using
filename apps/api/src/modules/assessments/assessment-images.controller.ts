import { BadRequestException, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { assessmentImageIdSchema, assessmentImageTypes } from '@lms/shared/longread-media';

import { AuthenticatedAccess, AuthGuard, Roles, RolesGuard, rolePolicies, type AuthenticatedRequest } from '../auth/public.js';
import { MAX_BUFFERED_UPLOAD_SIZE_BYTES, UploadService, validateUploadFile } from '../upload/public.js';

@Controller('assessment-images')
@UseGuards(AuthGuard, RolesGuard)
export class AssessmentImagesController {
  constructor(private readonly storage: UploadService) {}

  @Post()
  @Roles(...rolePolicies.assessmentsCreate)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_BUFFERED_UPLOAD_SIZE_BYTES } }))
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Req() request: AuthenticatedRequest) {
    const extension = Object.entries(assessmentImageTypes).find(([, type]) => type === file?.mimetype)?.[0];
    if (!file || !extension) throw new BadRequestException('Only JPEG, PNG, GIF and WebP images can be uploaded');
    validateUploadFile(file);
    return { id: await this.storage.uploadAssessmentImage(file, request.currentUser!.organizationId, extension) };
  }

  @Get()
  @Roles(...rolePolicies.assessmentsCreate)
  async list(@Req() request: AuthenticatedRequest, @Query('cursor') rawCursor: unknown) {
    const cursor = z.string().min(1).max(4096).optional().parse(rawCursor);
    const { ids, nextCursor } = await this.storage.listAssessmentImages(request.currentUser!.organizationId, cursor);
    return { ids: ids.filter((id) => assessmentImageIdSchema.safeParse(id).success), nextCursor };
  }

  @Get(':id')
  @AuthenticatedAccess()
  async read(@Param('id') rawId: string, @Req() request: AuthenticatedRequest) {
    const id = assessmentImageIdSchema.parse(rawId);
    const extension = id.split('.')[1] as keyof typeof assessmentImageTypes;
    return { url: await this.storage.getInlinePresignedUrl(
      `organizations/${request.currentUser!.organizationId}/assessment-images/${id}`, assessmentImageTypes[extension],
    ) };
  }
}
