import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CertificatesService } from './certificates.service.js';
import { IssueCertificateInput, issueCertificateSchema } from './certificates.schemas.js';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.certificatesRead)
  listCertificates(@Req() request: AuthenticatedRequest) {
    return this.certificatesService.listCertificates(request.currentUser!.id, request.currentUser!.organizationId);
  }

  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.certificatesRead)
  getCertificate(@Param('id') certificateId: string, @Req() request: AuthenticatedRequest) {
    return this.certificatesService.getCertificate(
      certificateId,
      request.currentUser!.id,
      request.currentUser!.organizationId,
    );
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.certificatesCreate)
  @OrganizationScope('body', 'organizationId')
  issueCertificate(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: IssueCertificateInput = issueCertificateSchema.parse(body);

    return this.certificatesService.issueCertificate(input, request.currentUser!.id);
  }
}
