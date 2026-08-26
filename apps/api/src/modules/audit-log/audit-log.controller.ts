import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { auditLogQuerySchema } from './audit-log.schemas.js';
import { AuditLogService } from './audit-log.service.js';

@Controller('audit-log')
@UseGuards(AuthGuard, RolesGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles(...rolePolicies.auditLogRead)
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const parsed = auditLogQuerySchema.parse(query);
    return this.auditLogService.list(request.currentUser!.organizationId, parsed);
  }

  @Get('filter-options')
  @Roles(...rolePolicies.auditLogRead)
  listFilterOptions(@Req() request: AuthenticatedRequest) {
    return this.auditLogService.listFilterOptions(request.currentUser!.organizationId);
  }
}
