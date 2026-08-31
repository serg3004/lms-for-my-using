import { Global, Module } from '@nestjs/common';

import { OrganizationAccessScopeService } from './organization-access-scope.service.js';

@Global()
@Module({ providers: [OrganizationAccessScopeService], exports: [OrganizationAccessScopeService] })
export class OrganizationAccessScopeModule {}
