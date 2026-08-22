import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

import { PublicAccess } from '../auth/public.js';
import { getOpenApiDocument } from './openapi.document.js';

@Controller('openapi')
export class OpenApiController {
  @Get()
  @PublicAccess()
  @ApiOperation({ summary: 'Legacy manual OpenAPI document; use /api/v1/api-json instead', deprecated: true })
  getOpenApi() {
    return getOpenApiDocument();
  }
}
