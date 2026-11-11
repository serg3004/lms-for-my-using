import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { AuthGuard, PublicAccess, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { MAX_BUFFERED_UPLOAD_SIZE_BYTES } from '../upload/public.js';
import { ChecklistPublicService } from './checklist-public.service.js';
import { finishPublicChecklistSchema, skipChecklistItemSchema, startPublicChecklistSchema, submitChecklistItemResultSchema } from './checklists.schemas.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assertUuid = (value: string) => {
  if (!UUID_PATTERN.test(value)) throw new BadRequestException('Invalid id');
};

/**
 * PR 465: the guest side of a checklist link, `/api/v1/public/checklists/:token/...`. No session: the token in the path names
 * the one sheet, a pass key in `X-Guest-Pass` names the one pass. Per-address limits sit in the shared API middleware.
 */
@Controller('public/checklists')
export class ChecklistPublicController {
  constructor(private readonly publicChecklists: ChecklistPublicService) {}

  @Get(':token')
  @PublicAccess()
  open(@Param('token') token: string) {
    return this.publicChecklists.open(token);
  }

  @Get(':token/captcha')
  @PublicAccess()
  captcha(@Param('token') token: string) {
    return this.publicChecklists.newCaptcha(token);
  }

  @Post(':token/start')
  @PublicAccess()
  start(@Param('token') token: string, @Body() body: unknown) {
    return this.publicChecklists.start(token, startPublicChecklistSchema.parse(body));
  }

  /** A signed-in employee who followed the link: the ordinary free pass under their own account (any audience mode). */
  @Post(':token/start-signed-in')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.checklistsStartFree)
  startSignedIn(@Param('token') token: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.publicChecklists.startAsUser(token, user.organizationId, user.id);
  }

  @Get(':token/passes/:instanceId')
  @PublicAccess()
  getPass(@Param('token') token: string, @Param('instanceId') instanceId: string, @Headers('x-guest-pass') passKey: string | undefined) {
    return this.publicChecklists.getPass(token, instanceId, passKey);
  }

  @Patch(':token/passes/:instanceId/items/:itemId')
  @PublicAccess()
  submitItem(@Param('token') token: string, @Param('instanceId') instanceId: string, @Param('itemId') itemId: string, @Headers('x-guest-pass') passKey: string | undefined, @Body() body: unknown) {
    assertUuid(itemId);
    return this.publicChecklists.submitItem(token, instanceId, itemId, passKey, submitChecklistItemResultSchema.parse(body));
  }

  @Delete(':token/passes/:instanceId/items/:itemId/answer')
  @PublicAccess()
  clearAnswer(@Param('token') token: string, @Param('instanceId') instanceId: string, @Param('itemId') itemId: string, @Headers('x-guest-pass') passKey: string | undefined) {
    assertUuid(itemId);
    return this.publicChecklists.clearAnswer(token, instanceId, itemId, passKey);
  }

  @Post(':token/passes/:instanceId/items/:itemId/skip')
  @PublicAccess()
  skipItem(@Param('token') token: string, @Param('instanceId') instanceId: string, @Param('itemId') itemId: string, @Headers('x-guest-pass') passKey: string | undefined, @Body() body: unknown) {
    assertUuid(itemId);
    return this.publicChecklists.skipItem(token, instanceId, itemId, passKey, skipChecklistItemSchema.parse(body ?? {}));
  }

  @Post(':token/passes/:instanceId/items/:itemId/photo')
  @PublicAccess()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_BUFFERED_UPLOAD_SIZE_BYTES } }))
  attachPhoto(@Param('token') token: string, @Param('instanceId') instanceId: string, @Param('itemId') itemId: string, @Headers('x-guest-pass') passKey: string | undefined, @UploadedFile() file: Express.Multer.File | undefined) {
    assertUuid(itemId);
    return this.publicChecklists.attachPhoto(token, instanceId, itemId, passKey, file);
  }

  @Post(':token/passes/:instanceId/finish')
  @PublicAccess()
  finish(@Param('token') token: string, @Param('instanceId') instanceId: string, @Headers('x-guest-pass') passKey: string | undefined, @Body() body: unknown) {
    return this.publicChecklists.finish(token, instanceId, passKey, finishPublicChecklistSchema.parse(body));
  }
}
