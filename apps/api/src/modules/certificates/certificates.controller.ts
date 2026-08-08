import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';

import { paginationQuerySchema } from '../../common/pagination.schema.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CourseAccessGuard, CourseScope } from '../course-access/course-access.guard.js';
import { CertificatesService } from './certificates.service.js';
import { IssueCertificateInput, issueCertificateSchema } from './certificates.schemas.js';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
  @Roles(...rolePolicies.certificatesRead)
  listCertificates(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const { page, pageSize } = paginationQuerySchema.parse(query);
    return this.certificatesService.listCertificates(request.currentUser!, page, pageSize);
  }

  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.certificatesRead)
  @CourseScope('param', 'id', 'certificate')
  getCertificate(@Param('id') certificateId: string, @Req() request: AuthenticatedRequest) {
    return this.certificatesService.getCertificate(
      certificateId,
      request.currentUser!,
    );
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.certificatesCreate)
  @OrganizationScope('body', 'organizationId')
  @CourseScope('body', 'courseId')
  issueCertificate(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: IssueCertificateInput = issueCertificateSchema.parse(body);

    return this.certificatesService.issueCertificate(input, request.currentUser!);
  }
}
