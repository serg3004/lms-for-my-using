import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CourseAccessGuard, CourseScope } from '../course-access/course-access.guard.js';
import {
  createCourseMaterialSchema,
  CreateCourseMaterialInput,
  updateCourseMaterialStatusSchema,
  updateCourseMaterialSchema,
} from './course-materials.schemas.js';
import { CourseMaterialsService } from './course-materials.service.js';
import { UploadService } from '../upload/upload.service.js';
import { MAX_BUFFERED_UPLOAD_SIZE_BYTES, validateUploadFile } from '../upload/upload.validation.js';
import { MaterialMalwareScanService } from './material-malware-scan.service.js';
import { MaterialMultipartUploadService } from './material-multipart-upload.service.js';
import { completeMultipartUploadSchema, initiateMultipartUploadSchema } from './multipart-upload.schemas.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class CourseMaterialsController {
  constructor(
    private readonly courseMaterialsService: CourseMaterialsService,
    private readonly uploadService: UploadService,
    private readonly malwareScans: MaterialMalwareScanService,
    private readonly multipartUploads: MaterialMultipartUploadService,
  ) {}

  @Post('materials/:id/file/multipart')
  @Roles(...rolePolicies.courseMaterialsCreate)
  @CourseScope('param', 'id', 'material')
  initiateMultipartUpload(@Param('id') materialId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.multipartUploads.initiate(materialId, request.currentUser!.organizationId, initiateMultipartUploadSchema.parse(body));
  }

  @Post('materials/:id/file/multipart/:uploadId/complete')
  @Roles(...rolePolicies.courseMaterialsCreate)
  @CourseScope('param', 'id', 'material')
  completeMultipartUpload(@Param('id') materialId: string, @Param('uploadId') uploadId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.multipartUploads.complete(materialId, request.currentUser!.organizationId, uploadId, completeMultipartUploadSchema.parse(body));
  }

  @Delete('materials/:id/file/multipart/:uploadId')
  @Roles(...rolePolicies.courseMaterialsCreate)
  @CourseScope('param', 'id', 'material')
  abortMultipartUpload(@Param('id') materialId: string, @Param('uploadId') uploadId: string, @Req() request: AuthenticatedRequest) {
    return this.multipartUploads.abort(materialId, request.currentUser!.organizationId, uploadId);
  }

  @Get('courses/:courseId/materials')
  @Roles(...rolePolicies.courseMaterialsRead)
  @CourseScope('param', 'courseId')
  listCourseMaterials(@Param('courseId') courseId: string, @Req() request: AuthenticatedRequest) {
    return this.courseMaterialsService.listCourseMaterials(courseId, request.currentUser!.organizationId);
  }

  @Get('materials/:id')
  @Roles(...rolePolicies.courseMaterialsRead)
  @CourseScope('param', 'id', 'material')
  getCourseMaterial(@Param('id') materialId: string, @Req() request: AuthenticatedRequest) {
    return this.courseMaterialsService.getCourseMaterial(materialId, request.currentUser!.organizationId);
  }

  @Get('materials/:id/download')
  @Roles(...rolePolicies.courseMaterialsRead)
  @CourseScope('param', 'id', 'material')
  async getMaterialDownload(@Param('id') materialId: string, @Req() request: AuthenticatedRequest) {
    const material = await this.courseMaterialsService.getMaterialStorageReference(
      materialId,
      request.currentUser!.organizationId,
    );
    if (material.status !== 'active') throw new NotFoundException('Material file not found');
    if (material.objectKey && material.scanStatus === 'available') {
      const expiresIn = Math.min(Math.max(Number(process.env['S3_PRESIGNED_TTL_SECONDS'] ?? 300), 1), 300);
      return {
        url: await this.uploadService.getPresignedUrl(material.objectKey, material.fileName ?? 'download', expiresIn),
        expiresIn,
      };
    }
    if (material.kind === 'link' && material.fileUrl) return { url: material.fileUrl, expiresIn: null };
    throw new NotFoundException('Material file not found');
  }

  @Post('materials/:id/file')
  @Roles(...rolePolicies.courseMaterialsCreate)
  @CourseScope('param', 'id', 'material')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_BUFFERED_UPLOAD_SIZE_BYTES } }),
  )
  async uploadMaterialFile(
    @Param('id') materialId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    validateUploadFile(file);
    const organizationId = request.currentUser!.organizationId;
    await this.courseMaterialsService.getMaterialStorageReference(materialId, organizationId);
    const uploaded = await this.uploadService.uploadMaterialFile(file, organizationId, materialId);
    const material = await this.courseMaterialsService.attachUploadedFile(materialId, organizationId, uploaded);
    await this.malwareScans.dispatch(materialId);
    return material;
  }

  @Delete('materials/:id/file')
  @Roles(...rolePolicies.courseMaterialsCreate)
  @CourseScope('param', 'id', 'material')
  async deleteMaterialFile(@Param('id') materialId: string, @Req() request: AuthenticatedRequest) {
    const organizationId = request.currentUser!.organizationId;
    const material = await this.courseMaterialsService.getMaterialStorageReference(materialId, organizationId);
    if (material.objectKey) await this.uploadService.deleteObject(material.objectKey);
    if (material.quarantineKey) await this.uploadService.deleteObject(material.quarantineKey);
    return this.courseMaterialsService.clearUploadedFile(materialId, organizationId, request.currentUser!.id);
  }

  @Post('courses/:courseId/materials')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.courseMaterialsCreate)
  @OrganizationScope('body', 'organizationId')
  @CourseScope('param', 'courseId')
  createCourseMaterial(@Param('courseId') courseId: string, @Body() body: unknown) {
    const input: CreateCourseMaterialInput = createCourseMaterialSchema.parse({
      ...(typeof body === 'object' && body !== null ? body : {}),
      courseId,
    });

    return this.courseMaterialsService.createCourseMaterial(input);
  }

  @Patch('materials/:id/status')
  @Roles(...rolePolicies.courseMaterialsCreate)
  @CourseScope('param', 'id', 'material')
  updateCourseMaterialStatus(
    @Param('id') materialId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = updateCourseMaterialStatusSchema.parse(body);
    return this.courseMaterialsService.updateCourseMaterialStatus(
      materialId,
      request.currentUser!.organizationId,
      input.status,
    );
  }

  @Patch('materials/:id')
  @Roles(...rolePolicies.courseMaterialsCreate)
  @CourseScope('param', 'id', 'material')
  updateCourseMaterial(@Param('id') materialId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateCourseMaterialSchema.parse(body);
    return this.courseMaterialsService.updateCourseMaterial(materialId, request.currentUser!.organizationId, input);
  }

  @Delete('materials/:id')
  @Roles(...rolePolicies.courseMaterialsCreate)
  @CourseScope('param', 'id', 'material')
  async deleteCourseMaterial(@Param('id') materialId: string, @Req() request: AuthenticatedRequest) {
    const organizationId = request.currentUser!.organizationId;
    const material = await this.courseMaterialsService.getMaterialStorageReference(materialId, organizationId);
    if (material.objectKey) await this.uploadService.deleteObject(material.objectKey);
    if (material.quarantineKey) await this.uploadService.deleteObject(material.quarantineKey);
    return this.courseMaterialsService.deleteCourseMaterial(materialId, organizationId);
  }
}
