import { Controller, Get } from '@nestjs/common';

import { getOpenApiDocument } from './openapi.document.js';

@Controller('openapi')
export class OpenApiController {
  @Get()
  getOpenApi() {
    return getOpenApiDocument();
  }
}
