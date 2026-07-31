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

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
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
import { MAX_UPLOAD_FILE_SIZE_BYTES, validateUploadFile } from '../upload/upload.validation.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class CourseMaterialsController {
  constructor(
    private readonly courseMaterialsService: CourseMaterialsService,
    private readonly uploadService: UploadService,
  ) {}

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
    if (material.objectKey) {
      return { url: await this.uploadService.getPresignedUrl(material.objectKey, 300), expiresIn: 300 };
    }
    if (material.kind === 'link' && material.fileUrl) return { url: material.fileUrl, expiresIn: null };
    throw new NotFoundException('Material file not found');
  }

  @Post('materials/:id/file')
  @Roles(...rolePolicies.courseMaterialsCreate)
  @CourseScope('param', 'id', 'material')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES } }),
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
    return this.courseMaterialsService.attachUploadedFile(materialId, organizationId, uploaded);
  }

  @Delete('materials/:id/file')
  @Roles(...rolePolicies.courseMaterialsCreate)
  @CourseScope('param', 'id', 'material')
  async deleteMaterialFile(@Param('id') materialId: string, @Req() request: AuthenticatedRequest) {
    const organizationId = request.currentUser!.organizationId;
    const material = await this.courseMaterialsService.getMaterialStorageReference(materialId, organizationId);
    if (material.objectKey) await this.uploadService.deleteObject(material.objectKey);
    return this.courseMaterialsService.clearUploadedFile(materialId, organizationId);
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
}
