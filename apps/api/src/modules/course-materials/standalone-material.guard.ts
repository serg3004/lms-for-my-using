import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { CourseMaterialsService } from './course-materials.service.js';

/** Version-owned files have their own access path; generic material APIs cannot read, replace or delete them. */
@Injectable()
export class StandaloneMaterialGuard implements CanActivate {
  constructor(private readonly materials: CourseMaterialsService) {}
  async canActivate(context: ExecutionContext) {
    const id = context.switchToHttp().getRequest<{ params: { id?: string } }>().params.id;
    if (id) await this.materials.ensureStandaloneMaterial(id);
    return true;
  }
}
