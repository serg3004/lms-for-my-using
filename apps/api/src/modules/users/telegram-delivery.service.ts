import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { hasNoEmail } from '../../common/no-email.js';
import {
  getTelegramBotUsername,
  isTelegramConfigured,
  telegramBotLink,
  telegramGateway,
  TelegramSendError,
  type TelegramErrorCode,
} from '../../common/telegram/telegram.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { AuthService } from '../auth/public.js';
import { linkTexts } from './link-messages.js';
import { messageTexts } from './telegram-messages.js';

/**
 * PR 503: sends an invitation or a temporary password to a person through the Telegram bot.
 *
 * A bot cannot write first, so a person who has not pressed "Start" gets a one-time bot link instead: the sender
 * hands it over, and the secret (invitation link or password) is created and sent only after the person has pressed
 * "Start". Nothing secret waits in the database for a chat. Only what was done is journaled; the text never is.
 */
export type DeliveryKind = 'invitation' | 'temporary_password' | 'install_link';
/** PR 572: a link to one check, sent only to a chat that is already bound (the code of a bot link carries no check). */
export type LinkTarget = { kind: 'install_link' } | { kind: 'session_link'; path: string };
export type DeliveryFailure = TelegramErrorCode | 'unavailable';
export type TelegramSendResult =
  | { status: 'sent' }
  | { status: 'failed'; reason: DeliveryFailure }
  | { status: 'awaiting_start'; botLink: string; expiresAt: Date };

type Sender = { id: string; organizationId: string };
type Recipient = { id: string; organizationId: string; email: string; firstName: string; lastName: string; middleName: string | null; locale: string; status: string; identityActivation: boolean };

const linkLifetimeMs = 3 * 24 * 60 * 60 * 1000;
const repeatIntervalMs = 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
const dailyLimit = () => Number(process.env['TELEGRAM_DAILY_LIMIT']) || 300;

const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');
const frontend = () => (process.env['FRONTEND_URL'] ?? '').replace(/\/+$/, '');

const recipientSelect = {
  id: true, organizationId: true, email: true, firstName: true, lastName: true, middleName: true, locale: true, status: true, identityActivation: true,
} as const;

@Injectable()
export class TelegramDeliveryService {
  private readonly logger = new Logger(TelegramDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly authService?: AuthService,
  ) {}

  /** What the screen needs before it offers the channel. */
  async status(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { telegramDeliveryEnabled: true } });
    return { configured: isTelegramConfigured(), enabled: organization?.telegramDeliveryEnabled ?? false, botUsername: getTelegramBotUsername() };
  }

  /** The last sends to one person and whether their Telegram is bound; the caller has already checked access to the person. */
  async history(organizationId: string, userId: string) {
    const [link, items] = await Promise.all([
      this.prisma.userTelegramLink.findUnique({ where: { userId }, select: { linkedAt: true } }),
      this.prisma.messageDelivery.findMany({
        where: { organizationId, userId, channel: 'telegram' },
        orderBy: { createdAt: 'desc' }, take: 5,
        select: { id: true, kind: true, status: true, errorCode: true, createdAt: true },
      }),
    ]);
    return { linked: Boolean(link), linkedAt: link?.linkedAt ?? null, items };
  }

  async send(sender: Sender, userId: string, kind: DeliveryKind, userWhere: Prisma.UserWhereInput): Promise<TelegramSendResult> {
    const organizationId = sender.organizationId;
    const state = await this.status(organizationId);
    if (!state.configured) throw new ConflictException('Telegram is not configured');
    if (!state.enabled) throw new ConflictException('Telegram delivery is disabled for the organization');

    const user = await this.prisma.user.findFirst({
      where: { ...userWhere, id: userId, organizationId, deletedAt: null }, select: recipientSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    this.assertAllowed(user, kind, sender);
    await this.assertWithinLimits(organizationId, userId, kind);

    const link = await this.prisma.userTelegramLink.findUnique({ where: { userId }, select: { chatId: true } });
    if (link) return this.deliver(user, link.chatId, kind, sender.id);

    return this.awaitStart(user, kind, sender.id);
  }

  /** A webhook call from Telegram. It never throws: Telegram retries failures, and the answer must not tell what was wrong. */
  async handleUpdate(update: unknown): Promise<void> {
    try {
      const message = (update as { message?: { chat?: { id?: number | string; type?: string }; text?: unknown } } | null)?.message;
      const chat = message?.chat;
      if (!chat || chat.type !== 'private' || typeof message?.text !== 'string' || chat.id === undefined) return;
      const start = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{16,64}))?$/.exec(message.text.trim());
      if (!start) return;
      const chatId = String(chat.id);
      const bound = start[1] ? await this.bind(start[1], chatId) : null;
      if (!bound) {
        await telegramGateway.send(chatId, `${messageTexts('ru').invalidLink}\n\n${messageTexts('en').invalidLink}`).catch(() => undefined);
        return;
      }
      await telegramGateway.send(chatId, messageTexts(bound.user.locale).bound(bound.user.firstName)).catch(() => undefined);
      await this.deliver(bound.user, chatId, bound.kind, bound.createdById);
    } catch {
      this.logger.warn('Telegram update was not handled');
    }
  }

  private async bind(code: string, chatId: string) {
    const row = await this.prisma.telegramLinkCode.findUnique({ where: { codeHash: hashCode(code) } });
    if (!row || row.usedAt || row.expiresAt <= new Date() || (row.intent !== 'invitation' && row.intent !== 'temporary_password' && row.intent !== 'install_link')) return null;
    const state = await this.status(row.organizationId);
    if (!state.configured || !state.enabled) return null;
    const user = await this.prisma.user.findFirst({ where: { id: row.userId, organizationId: row.organizationId, deletedAt: null }, select: recipientSelect });
    if (!user) return null;
    // One chat serves one person: another person's code from the same chat must not read their messages.
    const taken = await this.prisma.userTelegramLink.findFirst({ where: { organizationId: row.organizationId, chatId, NOT: { userId: user.id } }, select: { id: true } });
    if (taken) return null;
    const used = await this.prisma.telegramLinkCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count !== 1) return null;
    await this.prisma.userTelegramLink.upsert({
      where: { userId: user.id },
      create: { userId: user.id, organizationId: row.organizationId, chatId },
      update: { chatId, linkedAt: new Date() },
    });
    await this.auditLog.record({
      organizationId: row.organizationId, actorId: null, action: 'user.telegram_linked', targetType: 'user', targetId: user.id,
      summary: 'Telegram was bound to a person', metadata: {},
    });
    return { user, kind: row.intent as DeliveryKind, createdById: row.createdById };
  }

  /** PR 572: sends the link to install the app, or to open one check, through Telegram. */
  async sendLink(sender: Sender, userId: string, target: LinkTarget, userWhere: Prisma.UserWhereInput): Promise<TelegramSendResult> {
    const organizationId = sender.organizationId;
    const state = await this.status(organizationId);
    if (!state.configured) throw new ConflictException('Telegram is not configured');
    if (!state.enabled) throw new ConflictException('Telegram delivery is disabled for the organization');
    const user = await this.prisma.user.findFirst({ where: { ...userWhere, id: userId, organizationId, deletedAt: null }, select: recipientSelect });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== 'active' && !(user.status === 'invited' && target.kind === 'install_link')) throw new ConflictException('The person cannot receive this link');
    await this.assertWithinLimits(organizationId, userId, target.kind);
    const link = await this.prisma.userTelegramLink.findUnique({ where: { userId }, select: { chatId: true } });
    if (link) return this.deliverLink(user, link.chatId, target, sender.id);
    if (target.kind === 'session_link') throw new ConflictException('Telegram is not connected for this person');
    return this.awaitStart(user, 'install_link', sender.id);
  }

  private async awaitStart(user: Recipient, kind: DeliveryKind, senderId: string): Promise<TelegramSendResult> {
    // Not bound yet: earlier unused links stop working, a fresh one waits for "Start".
    const code = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + linkLifetimeMs);
    await this.prisma.$transaction([
      this.prisma.telegramLinkCode.updateMany({ where: { userId: user.id, organizationId: user.organizationId, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.telegramLinkCode.create({ data: { userId: user.id, organizationId: user.organizationId, codeHash: hashCode(code), intent: kind, createdById: senderId, expiresAt } }),
    ]);
    await this.journal(user, kind, 'awaiting_start', null, senderId);
    return { status: 'awaiting_start', botLink: telegramBotLink(code), expiresAt };
  }

  private async deliverLink(user: Recipient, chatId: string, target: LinkTarget, senderId: string | null): Promise<TelegramSendResult> {
    const texts = linkTexts(user.locale);
    const link = `${frontend()}${target.kind === 'install_link' ? '/install' : target.path}`;
    const text = target.kind === 'install_link' ? texts.install({ firstName: user.firstName, link }) : texts.session({ firstName: user.firstName, link });
    try {
      await telegramGateway.send(chatId, text);
    } catch (error) {
      const reason: TelegramErrorCode = error instanceof TelegramSendError ? error.code : 'network';
      await this.journal(user, target.kind, 'failed', reason, senderId);
      return { status: 'failed', reason };
    }
    await this.journal(user, target.kind, 'sent', null, senderId);
    return { status: 'sent' };
  }

  private assertAllowed(user: Recipient, kind: DeliveryKind, sender: Sender) {
    if (kind === 'invitation' && user.status !== 'invited') throw new ConflictException('Only a person waiting for the first sign-in can be invited');
    if (kind === 'temporary_password') {
      if (user.status !== 'active') throw new ConflictException('A temporary password can be issued only for an active user');
      if (user.id === sender.id) throw new ConflictException('Use "change password" for your own account');
    }
  }

  private async assertWithinLimits(organizationId: string, userId: string, kind: DeliveryKind | 'session_link') {
    const now = Date.now();
    const recent = await this.prisma.messageDelivery.count({
      where: { organizationId, userId, channel: 'telegram', kind, createdAt: { gt: new Date(now - repeatIntervalMs) } },
    });
    if (recent > 0) throw new HttpException('A message was sent to this person a moment ago', HttpStatus.TOO_MANY_REQUESTS);
    const today = await this.prisma.messageDelivery.count({
      where: { organizationId, channel: 'telegram', status: 'sent', createdAt: { gt: new Date(now - dayMs) } },
    });
    if (today >= dailyLimit()) throw new HttpException('The daily limit of Telegram messages is used up', HttpStatus.TOO_MANY_REQUESTS);
  }

  /** Creates the secret (a fresh invitation or a fresh temporary password) and sends it to the bound chat. */
  private async deliver(user: Recipient, chatId: string, kind: DeliveryKind, senderId: string | null): Promise<TelegramSendResult> {
    if (kind === 'install_link') return this.deliverLink(user, chatId, { kind }, senderId);
    const texts = messageTexts(user.locale);
    let text: string;
    try {
      const organization = await this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true, slug: true } });
      const organizationName = organization?.name ?? '';
      if (kind === 'invitation') {
        if (user.status !== 'invited') throw new ConflictException('unavailable');
        if (hasNoEmail(user.email) || user.identityActivation) {
          text = texts.activation({ firstName: user.firstName, organizationName, link: `${frontend()}/activate`, organization: organization?.slug ?? '' });
        } else {
          if (!this.authService) throw new ConflictException('unavailable');
          const issued = await this.authService.sendInvitation(user.id, user.organizationId, senderId, undefined, { mail: false });
          if (!issued.inviteUrl) throw new ConflictException('unavailable');
          text = texts.invitation({ firstName: user.firstName, organizationName, link: issued.inviteUrl, days: Math.max(1, Math.round((issued.expiresAt.getTime() - Date.now()) / dayMs)) });
        }
      } else {
        if (user.status !== 'active' || !this.authService) throw new ConflictException('unavailable');
        const issued = await this.authService.issueTemporaryPasswordFor(user);
        text = texts.temporaryPassword({
          firstName: user.firstName, organizationName, link: `${frontend()}/login`, password: issued.temporaryPassword,
          days: Math.max(1, Math.round((issued.expiresAt.getTime() - Date.now()) / dayMs)),
        });
      }
    } catch {
      await this.journal(user, kind, 'failed', 'unavailable', senderId);
      return { status: 'failed', reason: 'unavailable' };
    }
    try {
      await telegramGateway.send(chatId, text);
    } catch (error) {
      const reason: TelegramErrorCode = error instanceof TelegramSendError ? error.code : 'network';
      await this.journal(user, kind, 'failed', reason, senderId);
      return { status: 'failed', reason };
    }
    await this.journal(user, kind, 'sent', null, senderId);
    return { status: 'sent' };
  }

  private async journal(user: Recipient, kind: DeliveryKind | 'session_link', status: 'sent' | 'failed' | 'awaiting_start', errorCode: string | null, senderId: string | null) {
    await this.prisma.messageDelivery.create({
      data: { organizationId: user.organizationId, userId: user.id, channel: 'telegram', kind, status, errorCode, createdById: senderId },
    });
    await this.auditLog.record({
      organizationId: user.organizationId, actorId: senderId, action: `user.telegram_${status}`, targetType: 'user', targetId: user.id,
      summary: `Telegram ${kind} ${status}`, metadata: { channel: 'telegram', kind, ...(errorCode ? { errorCode } : {}) },
    });
  }
}
