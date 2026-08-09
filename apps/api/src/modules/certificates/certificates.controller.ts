import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';

import { paginationQuerySchema } from '../../common/pagination.schema.js';
import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { OrganizationScope } from '../auth/public.js';
import { OrganizationScopeGuard } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { CourseAccessGuard, CourseScope } from '../course-access/public.js';
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
