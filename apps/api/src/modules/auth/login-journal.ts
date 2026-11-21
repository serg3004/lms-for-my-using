import { Logger } from '@nestjs/common';

import { describeDevice, maskIp, type ClientContext } from '../../common/device-info.js';
import { PrismaService } from '../../database/prisma.service.js';

export type LoginOutcome = 'success' | 'failed' | 'blocked' | 'locked';

/** PR 494: the journal of sign-ins of existing accounts; a failure to write it never changes the sign-in itself. */
export class LoginJournal {
  private readonly logger = new Logger(LoginJournal.name);

  constructor(private readonly prisma: PrismaService) {}

  device(context: ClientContext | undefined) {
    return { deviceLabel: describeDevice(context?.userAgent), ipMasked: maskIp(context?.ip) };
  }

  async record(user: { id: string; organizationId: string }, outcome: LoginOutcome, context: ClientContext | undefined) {
    try {
      await this.prisma.loginEvent.create({ data: { organizationId: user.organizationId, userId: user.id, outcome, ...this.device(context) } });
    } catch {
      this.logger.warn('Login event was not recorded');
    }
  }
}

/** Events older than each organization's retention (never below 90 days); returns how many were or would be removed. */
export async function purgeLoginEvents(prisma: PrismaService, dryRun: boolean) {
  if (dryRun) {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM login_events e JOIN organizations o ON o.id = e.organization_id
      WHERE e.created_at < now() - make_interval(days => o.login_log_retention_days)`;
    return Number(rows[0]?.count ?? 0);
  }
  return prisma.$executeRaw`
    DELETE FROM login_events e USING organizations o
    WHERE o.id = e.organization_id AND e.created_at < now() - make_interval(days => o.login_log_retention_days)`;
}
