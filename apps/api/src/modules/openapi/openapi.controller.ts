import { Controller, Get } from '@nestjs/common';

import { PublicAccess } from '../auth/public.js';
import { getOpenApiDocument } from './openapi.document.js';

@Controller('openapi')
export class OpenApiController {
  @Get()
  @PublicAccess()
  getOpenApi() {
    return getOpenApiDocument();
  }
}
