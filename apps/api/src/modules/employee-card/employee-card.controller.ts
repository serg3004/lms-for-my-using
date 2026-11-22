import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedAccess, OrganizationScope, OrganizationScopeGuard, PublicAccess, Roles, RolesGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { cardPolicySchema, cardTokenSchema, createInspectorSchema } from './employee-card.schemas.js';
import { EmployeeCardService } from './employee-card.service.js';

type ImageResponse = { set(headers: Record<string, string>): ImageResponse; send(body: Buffer): void };
type ScanRequest = { ip?: string | undefined; headers: { 'user-agent'?: string | string[] | undefined } };

/**
 * PR 507: the employee card opened by scanning a badge. The badge token travels in the body, never in an address, so it stays
 * out of server logs. Opening, the photo and the "checked" mark are the only calls an outside inspector may make (see the guard).
 */
@Controller('employee-card')
export class EmployeeCardController {
  constructor(private readonly card: EmployeeCardService) {}

  @Post('open')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @AuthenticatedAccess()
  open(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.card.open(request.currentUser!, cardTokenSchema.parse(body).token);
  }

  @Post('checked')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @AuthenticatedAccess()
  checked(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.card.markChecked(request.currentUser!, cardTokenSchema.parse(body).token);
  }

  @Post('photo')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @AuthenticatedAccess()
  async photo(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Res() response: ImageResponse) {
    const file = await this.card.photo(request.currentUser!, cardTokenSchema.parse(body).token);
    response.set({ 'Content-Type': file.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Length': String(file.bytes.length) }).send(file.bytes);
  }

  /** The scan of somebody who is not signed in: it only leaves a line in the journal and never answers with any data. */
  @Post('anonymous-scan')
  @HttpCode(200)
  @PublicAccess()
  anonymousScan(@Body() body: unknown, @Req() request: ScanRequest) {
    const userAgent = request.headers['user-agent'];
    return this.card.anonymousScan(cardTokenSchema.parse(body).token, { ip: request.ip, userAgent: typeof userAgent === 'string' ? userAgent : undefined });
  }

  /** Who opened my card lately (the employee sees it in the profile). */
  @Get('views')
  @UseGuards(AuthGuard)
  @AuthenticatedAccess()
  views(@Req() request: AuthenticatedRequest) {
    return this.card.views(request.currentUser!);
  }

  @Get('policy/:organizationId')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles('admin')
  @OrganizationScope('param', 'organizationId')
  getPolicy(@Param('organizationId') organizationId: string) {
    return this.card.getPolicy(organizationId);
  }

  @Patch('policy/:organizationId')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles('admin')
  @OrganizationScope('param', 'organizationId')
  updatePolicy(@Param('organizationId') organizationId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.card.updatePolicy(organizationId, cardPolicySchema.parse(body).blocks, request.currentUser?.id ?? null);
  }

  @Get('inspectors')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  listInspectors(@Req() request: AuthenticatedRequest) {
    return this.card.listInspectors(request.currentUser!.organizationId);
  }

  @Post('inspectors')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  createInspector(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.card.createInspector(createInspectorSchema.parse(body), request.currentUser!);
  }

  @Delete('inspectors/:userId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  revokeInspector(@Param('userId') userId: string, @Req() request: AuthenticatedRequest) {
    return this.card.revokeInspector(request.currentUser!.organizationId, userId, request.currentUser!.id);
  }
}
