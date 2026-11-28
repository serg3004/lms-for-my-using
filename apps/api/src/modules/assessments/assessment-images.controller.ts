import { BadRequestException, Controller, Get, Header, NotFoundException, Param, Post, Query, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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

  /**
   * PR 541: the picture itself, for the image editor. The editor draws it on a canvas, which the browser refuses for a
   * picture from another origin, so the author's session reads the bytes here instead of the signed link.
   */
  @Get(':id/content')
  @Header('Cache-Control', 'private, no-store')
  @Roles(...rolePolicies.assessmentsCreate)
  async content(@Param('id') rawId: string, @Req() request: AuthenticatedRequest) {
    const id = assessmentImageIdSchema.parse(rawId);
    const extension = id.split('.')[1] as keyof typeof assessmentImageTypes;
    const bytes = await this.storage.getObjectBytes(`organizations/${request.currentUser!.organizationId}/assessment-images/${id}`, MAX_BUFFERED_UPLOAD_SIZE_BYTES);
    if (!bytes) throw new NotFoundException('Image not found');
    return new StreamableFile(bytes, { type: assessmentImageTypes[extension] });
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
