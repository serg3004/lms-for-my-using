import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, mergeMap } from 'rxjs';

import { PrismaService } from '../../database/prisma.service.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { endsKioskSession } from './kiosk-routes.js';

/** Two minutes to read the result on the screen after the work is handed in; then the kiosk session no longer opens anything. */
const graceMs = 2 * 60 * 1000;

/**
 * PR 506: after a kiosk session finishes a checklist or a test, the session closes itself, so the next person at the tablet
 * starts with a new scan. The response of the finishing call is not touched.
 */
@Injectable()
export class KioskFinishInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.currentUser;
    if (!user?.kiosk || !endsKioskSession(request.method, (request.originalUrl ?? request.url ?? '').split('?')[0])) return next.handle();
    return next.handle().pipe(mergeMap(async (result) => {
      const now = Date.now();
      await this.prisma.session.updateMany({
        where: { userId: user.id, organizationId: user.organizationId, viaBadge: true, revokedAt: null },
        data: { expiresAt: new Date(now + graceMs), refreshExpiresAt: new Date(now) },
      }).catch(() => undefined);
      return result;
    }));
  }
}
