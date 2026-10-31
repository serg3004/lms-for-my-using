import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { AuthGuard, Roles, RolesGuard, rolePolicies, type AuthenticatedRequest } from '../auth/public.js';
import { CourseAccessGuard, CourseScope } from '../course-access/public.js';
import { MAX_BUFFERED_UPLOAD_SIZE_BYTES } from '../upload/public.js';
import { createLongreadFilesSchema, LongreadFilesService } from './longread-files.service.js';
const completeSchema = z.object({ parts: z.array(z.object({ partNumber: z.number().int().min(1).max(7), etag: z.string().min(1).max(256) }).strict()).min(1).max(7) }).strict();
const versionSchema = z.object({ version: z.coerce.number().int().positive().optional() }).strict();
@Controller('lessons/:id/longread/files')
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class LongreadFilesController {
  constructor(private readonly files: LongreadFilesService) {}
  @Post() @Roles(...rolePolicies.lessonsCreate) @CourseScope('param', 'id', 'lesson')
  create(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest) { return this.files.create(id, req.currentUser!.organizationId, createLongreadFilesSchema.parse(body)); }
  @Get(':fileId') @Roles(...rolePolicies.lessonsCreate) @CourseScope('param', 'id', 'lesson')
  get(@Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @Req() req: AuthenticatedRequest) { return this.files.get(id, fileId, req.currentUser!.organizationId); }
  @Post(':fileId/content') @Roles(...rolePolicies.lessonsCreate) @CourseScope('param', 'id', 'lesson')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_BUFFERED_UPLOAD_SIZE_BYTES } }))
  upload(@Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: AuthenticatedRequest) {
    if (!file) throw new BadRequestException('No file provided'); return this.files.upload(id, fileId, req.currentUser!.organizationId, file);
  }
  @Post(':fileId/multipart') @Roles(...rolePolicies.lessonsCreate) @CourseScope('param', 'id', 'lesson')
  initiate(@Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @Req() req: AuthenticatedRequest) { return this.files.initiate(id, fileId, req.currentUser!.organizationId); }
  @Post(':fileId/multipart/:uploadId/complete') @Roles(...rolePolicies.lessonsCreate) @CourseScope('param', 'id', 'lesson')
  complete(@Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @Param('uploadId') uploadId: string, @Body() body: unknown, @Req() req: AuthenticatedRequest) { return this.files.complete(id, fileId, req.currentUser!.organizationId, uploadId, completeSchema.parse(body)); }
  @Delete(':fileId/multipart/:uploadId') @Roles(...rolePolicies.lessonsCreate) @CourseScope('param', 'id', 'lesson')
  abort(@Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @Param('uploadId') uploadId: string, @Req() req: AuthenticatedRequest) { return this.files.abort(id, fileId, req.currentUser!.organizationId, uploadId); }
  @Get(':fileId/preview') @Roles(...rolePolicies.lessonsCreate) @CourseScope('param', 'id', 'lesson')
  preview(@Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @Req() req: AuthenticatedRequest) { return this.files.url(id, fileId, req.currentUser!, true); }
  @Get(':fileId/download') @Roles(...rolePolicies.lessonsRead) @CourseScope('param', 'id', 'lesson')
  download(@Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string, @Query() query: unknown, @Req() req: AuthenticatedRequest) { return this.files.url(id, fileId, req.currentUser!, false, versionSchema.parse(query).version); }
}
