import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { AuthGuard, AuthenticatedAccess } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { PROFILE_PHOTO_MAX_BYTES, updateOwnProfileSchema } from './profile.schemas.js';
import { ProfileService } from './profile.service.js';

type ImageResponse = {
  set(headers: Record<string, string>): ImageResponse;
  status(code: number): ImageResponse;
  send(body?: Buffer): ImageResponse;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PR 496: a person's own profile (any signed-in user) and the photo, readable by those who may read that user. */
@Controller()
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('auth/me/profile')
  @AuthenticatedAccess()
  getProfile(@Req() request: AuthenticatedRequest) {
    return this.profile.getOwnProfile(request.currentUser!.id, request.currentUser!.organizationId);
  }

  @Patch('auth/me/profile')
  @AuthenticatedAccess()
  updateProfile(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.profile.updateOwnProfile(request.currentUser!.id, request.currentUser!.organizationId, updateOwnProfileSchema.parse(body));
  }

  @Post('auth/me/photo')
  @AuthenticatedAccess()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: PROFILE_PHOTO_MAX_BYTES } }))
  uploadPhoto(@Req() request: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file provided');
    return this.profile.setOwnPhoto(request.currentUser!.id, request.currentUser!.organizationId, file);
  }

  @Delete('auth/me/photo')
  @AuthenticatedAccess()
  removePhoto(@Req() request: AuthenticatedRequest) {
    return this.profile.removeOwnPhoto(request.currentUser!.id, request.currentUser!.organizationId);
  }

  @Get('users/:id/photo')
  @AuthenticatedAccess()
  async getPhoto(@Param('id') id: string, @Headers('if-none-match') ifNoneMatch: string | undefined, @Req() request: AuthenticatedRequest, @Res() response: ImageResponse) {
    const actor = request.currentUser!;
    const targetId = id === 'me' ? actor.id : id;
    if (!UUID_PATTERN.test(targetId)) throw new BadRequestException('Invalid user id');

    const file = await this.profile.getPhotoFile(targetId, actor);
    const etag = `"${file.version}"`;
    const headers = { 'Content-Type': file.mimeType, 'Cache-Control': 'private, no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff' };
    if (ifNoneMatch === etag) {
      response.set(headers).status(304).send();
      return;
    }
    response.set({ ...headers, 'Content-Length': String(file.bytes.length) }).send(file.bytes);
  }
}
