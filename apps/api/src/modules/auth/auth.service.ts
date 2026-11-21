import type { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { type CurrentUser, type ChangePasswordInput, type InvitationAcceptInput, type LoginInput, type PasswordResetConfirmInput, type PasswordResetRequestInput, type UpdatePreferencesInput, type UserRole } from './auth.schemas.js';
import { type JwtClaims, signJwt, verifyJwt } from './auth.tokens.js';
import { createRefreshToken } from './auth.refresh-tokens.js';
import { refreshTokenLifetimeMs } from './auth.lifecycle.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { buildPasswordChangedMail } from './password-changed-mail.js';
import { buildInvitationMail, createInvitationToken, hashInvitationToken, invitationLifetimeDays, invitationLifetimeMs } from './user-invitation.js';
import { isMailConfigured, sendMail } from '../../common/mail/mailer.js';
import { assertPasswordPolicy, passwordPolicyError } from '../../common/password-policy.js';
import { isPasswordReused, loadPasswordPolicy, rememberReplacedPassword } from './password-policy.js';
import { createPasswordResetToken, hashPasswordResetToken, PasswordResetDelivery, passwordResetLifetimeMs } from './password-reset.js';

const currentUserSelect = {
  id: true,
  organizationId: true,
  email: true,
  firstName: true,
  lastName: true,
  middleName: true,
  position: true,
  shift: true,
  phone: true,
  status: true,
  locale: true,
  timezone: true,
} as const;

const loginUserSelect = {
  ...currentUserSelect,
  passwordHash: true,
} as const;

const logoutAccepted = {
  accepted: true,
} as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CurrentUserRecord = Omit<CurrentUser, 'roles'>;

function invalidCredentialsException() {
  return new UnauthorizedException({
    error: {
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid credentials',
    },
  });
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly passwordResetDelivery?: PasswordResetDelivery,
  ) {}

  async findActiveUserByLoginIdentity(input: Pick<LoginInput, 'organizationId' | 'email'>) {
    const organizationId = await this.resolveLoginOrganizationId(input.organizationId);

    const user = await this.prisma.user.findFirst({
      where: {
        organizationId,
        email: input.email,
        status: 'active',
        deletedAt: null,
      },
      select: currentUserSelect,
    });

    if (!user) {
      throw invalidCredentialsException();
    }

    return this.withRoles(user);
  }

  async findActiveUserByCurrentUserClaims(input: Pick<JwtClaims, 'sub' | 'organizationId' | 'email'>) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: input.sub,
        organizationId: input.organizationId,
        email: input.email,
        status: 'active',
        deletedAt: null,
      },
      select: currentUserSelect,
    });

    if (!user) {
      throw invalidCredentialsException();
    }

    return this.withRoles(user);
  }

  async validateLogin(input: LoginInput) {
    const organizationId = await this.resolveLoginOrganizationId(input.organizationId);

    const user = await this.prisma.user.findFirst({
      where: {
        organizationId,
        email: input.email,
        status: 'active',
        deletedAt: null,
      },
      select: loginUserSelect,
    });

    if (!user) {
      throw invalidCredentialsException();
    }

    const isPasswordValid = await verifyPassword(input.password, user.passwordHash);

    if (!isPasswordValid) {
      throw invalidCredentialsException();
    }

    return this.withRoles({
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName,
      position: user.position,
      shift: user.shift,
      phone: user.phone,
      status: user.status,
      locale: user.locale,
      timezone: user.timezone,
    });
  }

  async requestPasswordReset(input: PasswordResetRequestInput) {
    // An unknown organization name must look exactly like an unknown email: the answer stays "accepted".
    const organizationId = await this.resolveLoginOrganizationId(input.organizationId).catch(() => null);
    const user = organizationId && await this.prisma.user.findFirst({
      where: { organizationId, email: input.email, status: 'active', deletedAt: null },
      select: { id: true, organizationId: true, email: true },
    });

    if (user) {
      const reset = createPasswordResetToken();
      const expiresAt = new Date(Date.now() + passwordResetLifetimeMs);
      await this.prisma.$transaction([
        this.prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.passwordResetToken.create({
          data: { userId: user.id, organizationId: user.organizationId, tokenHash: reset.hash, expiresAt },
        }),
      ]);

      // Delivery failures are deliberately hidden so account existence cannot be inferred.
      await this.passwordResetDelivery?.send({ ...user, token: reset.token, expiresAt }).catch(() => undefined);
    }

    return logoutAccepted;
  }

  /**
   * Administrator-initiated reset: the same one-hour single-use link as "forgot password", issued for an
   * already-checked user. The link goes to the user's email when mail is set up; otherwise (or if sending
   * fails) the caller gets it once to hand over, because nobody else can read it afterwards.
   */
  async issuePasswordResetFor(user: { id: string; organizationId: string; email: string }) {
    const reset = createPasswordResetToken();
    const expiresAt = new Date(Date.now() + passwordResetLifetimeMs);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.create({ data: { userId: user.id, organizationId: user.organizationId, tokenHash: reset.hash, expiresAt } }),
    ]);
    let delivered = false;
    if (this.passwordResetDelivery?.checkReadiness() === 'ok') {
      delivered = await this.passwordResetDelivery.send({ ...user, token: reset.token, expiresAt }).then(() => true, () => false);
    }
    const frontend = (process.env['FRONTEND_URL'] ?? '').replace(/\/+$/, '');
    return { delivered, expiresAt, ...(delivered ? {} : { resetUrl: `${frontend}/password-reset?token=${reset.token}` }) };
  }

  /**
   * PR 487: one-time invitation link for a user created without a password (status `invited`). Earlier unused links
   * are revoked. The mail is written in the invited person's language; if mail is not set up or sending fails, the
   * caller gets the link once to hand over (nobody can read it afterwards, only its hash is stored).
   */
  async issueInvitationFor(
    user: { id: string; organizationId: string; email: string; firstName: string; locale: string },
    createdById: string | null,
  ) {
    const invitation = createInvitationToken();
    const expiresAt = new Date(Date.now() + invitationLifetimeMs);
    await this.prisma.$transaction([
      this.prisma.userInvitation.updateMany({ where: { userId: user.id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.userInvitation.create({
        data: { userId: user.id, organizationId: user.organizationId, tokenHash: invitation.hash, expiresAt, createdById },
      }),
    ]);

    return this.deliverInvitation(user, invitation.token, expiresAt);
  }

  /** Persist the invitation in the caller's user-creation transaction; send only after commit. */
  async prepareInvitationFor(
    user: { id: string; organizationId: string; email: string; firstName: string; locale: string },
    createdById: string | null,
    tx: Prisma.TransactionClient,
  ) {
    const invitation = createInvitationToken();
    const expiresAt = new Date(Date.now() + invitationLifetimeMs);
    await tx.userInvitation.create({ data: { userId: user.id, organizationId: user.organizationId, tokenHash: invitation.hash, expiresAt, createdById } });
    return () => this.deliverInvitation(user, invitation.token, expiresAt);
  }

  private async deliverInvitation(
    user: { id: string; organizationId: string; email: string; firstName: string; locale: string },
    token: string, expiresAt: Date,
  ) {
    const frontend = (process.env['FRONTEND_URL'] ?? '').replace(/\/+$/, '');
    const link = `${frontend}/invitation?token=${token}`;
    let delivered = false;
    if (isMailConfigured()) {
      const organization = await this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } });
      const mail = buildInvitationMail(user.locale, {
        firstName: user.firstName,
        organizationName: organization?.name ?? '',
        link,
        days: invitationLifetimeDays,
      });
      delivered = await sendMail({ to: user.email, ...mail }).then(
        () => true,
        () => {
          // Never log the error text or the address: provider errors can embed them.
          this.logger.warn('Invitation delivery failed');
          return false;
        },
      );
    }
    return { delivered, expiresAt, ...(delivered ? {} : { inviteUrl: link }) };
  }

  /** Public: sets the password from an invitation link. A missing, used, revoked or expired link all answer the same way. */
  async acceptInvitation(input: InvitationAcceptInput) {
    const now = new Date();
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(input.token) },
      select: { id: true, userId: true, organizationId: true, expiresAt: true, usedAt: true, revokedAt: true, user: { select: { status: true, deletedAt: true } } },
    });
    if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt <= now || invitation.user.status !== 'invited' || invitation.user.deletedAt) {
      throw new BadRequestException('Invalid or expired invitation');
    }
    const invitedUser = await this.prisma.user.findUnique({
      where: { id: invitation.userId },
      select: { id: true, organizationId: true, email: true, firstName: true, lastName: true, middleName: true, passwordHash: true },
    });
    if (!invitedUser) throw new BadRequestException('Invalid or expired invitation');
    // The link stays usable after a refused password, so the person can try again.
    await this.assertPasswordAllowed(invitedUser, input.password, { checkReuse: false });
    const passwordHash = await hashPassword(input.password);

    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.userInvitation.updateMany({
        where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException('Invalid or expired invitation');
      await transaction.userInvitation.updateMany({
        where: { userId: invitation.userId, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.user.update({ where: { id: invitation.userId }, data: { passwordHash, status: 'active' } });
      await transaction.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          actorId: invitation.userId,
          action: 'user.invitation.accepted',
          targetType: 'user',
          targetId: invitation.userId,
          summary: 'The invited user set a password and activated the account',
        },
      });
    });

    return logoutAccepted;
  }

  async confirmPasswordReset(input: PasswordResetConfirmInput) {
    const now = new Date();
    const tokenHash = hashPasswordResetToken(input.token);

    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, organizationId: true, expiresAt: true, usedAt: true },
    });
    if (!token || token.usedAt || token.expiresAt <= now) {
      throw new BadRequestException('Invalid or expired password reset token');
    }
    const resetUser = await this.prisma.user.findUnique({
      where: { id: token.userId },
      select: { id: true, organizationId: true, email: true, firstName: true, lastName: true, middleName: true, passwordHash: true },
    });
    if (!resetUser) throw new BadRequestException('Invalid or expired password reset token');
    // A refused password does not use up the link.
    await this.assertPasswordAllowed(resetUser, input.password);
    const passwordHash = await hashPassword(input.password);

    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException('Invalid or expired password reset token');

      await rememberReplacedPassword(transaction, resetUser, resetUser.passwordHash);
      await transaction.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await transaction.session.updateMany({
        where: { userId: token.userId, organizationId: token.organizationId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    return logoutAccepted;
  }

  /** Throws a 400 listing every rule the password breaks; used wherever a user's own password is set. */
  private async assertPasswordAllowed(
    user: { id: string; organizationId: string; email: string; firstName: string; lastName: string; middleName: string | null; passwordHash: string },
    password: string,
    options: { checkReuse?: boolean } = {},
  ) {
    const policy = await loadPasswordPolicy(this.prisma, user.organizationId);
    assertPasswordPolicy(password, policy, user);
    if (options.checkReuse !== false && await isPasswordReused(this.prisma, user, password, policy.historyCount)) {
      throw passwordPolicyError(['reused'], policy);
    }
  }

  /**
   * PR 488: the signed-in user changes their own password. The current one must be right (401 otherwise, so a stolen
   * session alone cannot do it), the new one follows the organization policy, every other session of the user ends
   * and the current one stays. The audit entry and the "password changed" mail carry no password.
   */
  async changePassword(accessToken: string, input: ChangePasswordInput) {
    let claims: JwtClaims;
    try {
      claims = await verifyJwt(accessToken);
      await this.validateSession(claims.jti);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: claims.sub, organizationId: claims.organizationId, status: 'active', deletedAt: null },
      select: { id: true, organizationId: true, email: true, firstName: true, lastName: true, middleName: true, locale: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('Invalid token');
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException({ error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'The current password is incorrect' } });
    }
    await this.assertPasswordAllowed(user, input.newPassword);
    const passwordHash = await hashPassword(input.newPassword);
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await rememberReplacedPassword(transaction, user, user.passwordHash);
      await transaction.user.update({ where: { id: user.id }, data: { passwordHash } });
      await transaction.session.updateMany({
        where: { userId: user.id, organizationId: user.organizationId, revokedAt: null, jti: { not: claims.jti } },
        data: { revokedAt: now },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: 'user.password_changed',
          targetType: 'user',
          targetId: user.id,
          summary: 'The user changed their own password',
        },
      });
    });

    if (isMailConfigured()) {
      await sendMail({ to: user.email, ...buildPasswordChangedMail(user.locale, { firstName: user.firstName, at: now }) }).catch(() => {
        // Never log the error text or the address: provider errors can embed them.
        this.logger.warn('Password changed notification failed');
      });
    }
    return logoutAccepted;
  }

  async logout(accessToken: string) {
    try {
      const claims = await verifyJwt(accessToken);
      await this.prisma.session.updateMany({
        where: { jti: claims.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // invalid token or session already revoked — logout is still accepted
    }
    return logoutAccepted;
  }

  async login(input: LoginInput) {
    const user = await this.validateLogin(input);
    const { token, jti, expiresAt } = await signJwt({
      sub: user.id,
      organizationId: user.organizationId,
      email: user.email,
    });
    const refresh = createRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + refreshTokenLifetimeMs);

    await this.prisma.session.create({
      data: {
        jti,
        userId: user.id,
        organizationId: user.organizationId,
        expiresAt,
        refreshTokenHash: refresh.hash,
        refreshExpiresAt,
      },
    });

    return {
      accessToken: token,
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      user,
    };
  }

  async refreshSession(sessionId: string, userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, status: 'active', deletedAt: null },
      select: currentUserSelect,
    });

    if (!user) {
      throw invalidCredentialsException();
    }

    const { token, jti, expiresAt } = await signJwt({
      sub: user.id,
      organizationId: user.organizationId,
      email: user.email,
    });

    const newRefresh = createRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + refreshTokenLifetimeMs);

    await this.prisma.session.update({
      where: { id: sessionId, userId, organizationId },
      data: { jti, expiresAt, refreshTokenHash: newRefresh.hash, refreshExpiresAt },
    });

    return {
      accessToken: token,
      refreshToken: newRefresh.token,
      tokenType: 'Bearer',
      user: await this.withRoles(user),
    };
  }

  async getCurrentUser(accessToken: string) {
    try {
      const claims = await verifyJwt(accessToken);

      await this.validateSession(claims.jti);

      return this.findActiveUserByCurrentUserClaims({
        sub: claims.sub,
        organizationId: claims.organizationId,
        email: claims.email,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async updatePreferences(userId: string, organizationId: string, input: UpdatePreferencesInput) {
    const user = await this.prisma.user.update({
      where: { id: userId, organizationId },
      data: { locale: input.locale },
      select: currentUserSelect,
    });

    return this.withRoles(user);
  }

  private async validateSession(jti: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        jti,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      throw new Error('Session not found or expired');
    }
  }

  private async resolveLoginOrganizationId(organizationIdOrSlug: string) {
    const normalizedOrganizationIdOrSlug = organizationIdOrSlug.trim().toLowerCase();

    if (uuidPattern.test(normalizedOrganizationIdOrSlug)) {
      return normalizedOrganizationIdOrSlug;
    }

    const organization = await this.prisma.organization.findFirst({
      where: {
        slug: normalizedOrganizationIdOrSlug,
        status: 'active',
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!organization) {
      throw invalidCredentialsException();
    }

    return organization.id;
  }

  private async withRoles(user: CurrentUserRecord): Promise<CurrentUser> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
      },
      select: {
        role: true,
      },
      orderBy: {
        role: 'asc',
      },
    });

    return {
      ...user,
      roles: memberships.map((membership) => membership.role as UserRole),
    };
  }
}
