import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenException, HttpException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';

import { describeDevice, maskIp, type ClientContext } from '../../common/device-info.js';
import { hasNoEmail } from '../../common/no-email.js';
import { isMailConfigured, sendMail } from '../../common/mail/mailer.js';
import { loadQrLoginPolicy, qrLoginRequestLifetimeMs } from '../../common/qr-login.js';
import { PrismaService } from '../../database/prisma.service.js';
import { buildQrLoginMail } from './qr-login-mail.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const newSecret = () => randomBytes(32).toString('base64url');
const secretShape = /^[A-Za-z0-9_-]{43}$/;
const notAllowed = () => new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Sign-in by QR is not available', details: [{ code: 'QR_LOGIN_NOT_ALLOWED', message: 'Sign-in by QR is not available' }] } });
const startsPerMinutePerAddress = 10;

type Person = { id: string; organizationId: string; status: string; mustChangePassword: boolean; loginLockedUntil: Date | null };

/**
 * PR 505: a device without a password asks for a sign-in, shows the code as a QR, and a phone that is already signed in
 * confirms it. The code in the QR and the secret that stays in the device are stored only as hashes, a request is used once and
 * lives two minutes. The phone sees the device before it confirms; every answer to a wrong or old code is the same.
 */
export class QrLogin {
  private readonly logger = new Logger(QrLogin.name);

  constructor(private readonly prisma: PrismaService) {}

  async start(context: ClientContext | undefined) {
    const ipMasked = maskIp(context?.ip);
    const now = Date.now();
    await this.prisma.qrLoginRequest.deleteMany({ where: { expiresAt: { lt: new Date(now - 60 * 60 * 1000) } } }).catch(() => undefined);
    if (ipMasked) {
      const recent = await this.prisma.qrLoginRequest.count({ where: { ipMasked, createdAt: { gt: new Date(now - 60_000) } } });
      if (recent >= startsPerMinutePerAddress) {
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    const code = newSecret();
    const pollToken = newSecret();
    const expiresAt = new Date(now + qrLoginRequestLifetimeMs);
    await this.prisma.qrLoginRequest.create({
      data: { codeHash: hash(code), pollHash: hash(pollToken), deviceLabel: describeDevice(context?.userAgent), ipMasked, expiresAt },
    });
    return { code, pollToken, expiresAt };
  }

  /** The device asks whether the phone decided. An approved request is handed over once; the caller opens the session. */
  async claim(pollToken: string, allowed: (user: Person) => Promise<boolean>): Promise<{ status: 'pending' | 'denied' | 'expired' } | { status: 'approved'; userId: string; device: string | null }> {
    if (!secretShape.test(pollToken)) return { status: 'expired' };
    const request = await this.prisma.qrLoginRequest.findUnique({ where: { pollHash: hash(pollToken) } });
    if (!request || request.expiresAt <= new Date() || request.status === 'used') return { status: 'expired' };
    if (request.status === 'pending') return { status: 'pending' };
    if (request.status === 'denied' || !request.userId) return { status: 'denied' };

    const user = await this.prisma.user.findFirst({
      where: { id: request.userId, status: 'active', deletedAt: null },
      select: { id: true, organizationId: true, status: true, mustChangePassword: true, loginLockedUntil: true },
    });
    if (!user || !(await allowed(user))) {
      await this.prisma.qrLoginRequest.updateMany({ where: { id: request.id, status: 'approved' }, data: { status: 'denied' } });
      return { status: 'denied' };
    }
    const used = await this.prisma.qrLoginRequest.updateMany({ where: { id: request.id, status: 'approved' }, data: { status: 'used' } });
    if (used.count !== 1) return { status: 'expired' };
    return { status: 'approved', userId: user.id, device: request.deviceLabel };
  }

  /** What the phone shows before the person confirms. A wrong, old or already decided code is "not found". */
  async inspect(code: string) {
    const request = await this.findPending(code);
    if (!request) throw new NotFoundException('Request not found');
    return { deviceLabel: request.deviceLabel, ipMasked: request.ipMasked, createdAt: request.createdAt, expiresAt: request.expiresAt };
  }

  async decide(person: Person & { organizationId: string }, code: string, decision: 'approved' | 'denied') {
    if (decision === 'approved' && !(await this.mayUse(person))) throw notAllowed();
    if (!secretShape.test(code)) throw new NotFoundException('Request not found');
    const result = await this.prisma.qrLoginRequest.updateMany({
      where: { codeHash: hash(code), status: 'pending', expiresAt: { gt: new Date() } },
      data: { status: decision, userId: person.id, decidedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException('Request not found');
    // The device is not named in the audit: the person already saw it on the phone and the sign-in journal records it.
    await this.prisma.auditLog.create({
      data: {
        organizationId: person.organizationId, actorId: person.id, action: `user.qr_login_${decision}`, targetType: 'user', targetId: person.id,
        summary: decision === 'approved' ? 'Sign-in by QR was confirmed on a phone' : 'Sign-in by QR was declined on a phone',
      },
    }).catch(() => this.logger.error('Failed to record the QR sign-in decision in the audit log'));
    return { [decision === 'approved' ? 'approved' : 'denied']: true } as { approved: true } | { denied: true };
  }

  /** The policy of the organization, and the account itself, must allow it: a wide-rights role needs the password. */
  async mayUse(person: Person): Promise<boolean> {
    if (person.status !== 'active' || person.mustChangePassword) return false;
    if (person.loginLockedUntil && person.loginLockedUntil.getTime() > Date.now()) return false;
    const policy = await loadQrLoginPolicy(this.prisma, person.organizationId);
    if (!policy.enabled) return false;
    const [memberships, customRoles] = await Promise.all([
      this.prisma.membership.findMany({ where: { userId: person.id, organizationId: person.organizationId }, select: { role: true } }),
      this.prisma.userCustomRoleAssignment.count({ where: { userId: person.id, organizationId: person.organizationId, state: 'active' } }),
    ]);
    // A custom role adds rights nobody has reviewed for this channel, so it needs the password too.
    if (customRoles > 0 || memberships.length === 0) return false;
    return memberships.every(({ role }) => policy.roles.includes(role));
  }

  /** The notice after a sign-in; the text carries the device only. */
  async notify(user: { id: string; organizationId: string; email: string; firstName: string; locale: string }, device: string | null) {
    if (!isMailConfigured() || hasNoEmail(user.email)) return;
    await sendMail({ to: user.email, ...buildQrLoginMail(user.locale, { firstName: user.firstName, device: device ?? '—' }) }).catch(() => {
      this.logger.warn('QR sign-in notification failed');
    });
  }

  private findPending(code: string) {
    if (!secretShape.test(code)) return null;
    return this.prisma.qrLoginRequest.findFirst({ where: { codeHash: hash(code), status: 'pending', expiresAt: { gt: new Date() } } });
  }
}
