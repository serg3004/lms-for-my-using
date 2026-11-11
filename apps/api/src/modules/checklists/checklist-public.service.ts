import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { getJwtSecret } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { UploadService, validateUploadFile } from '../upload/public.js';
import { guestPassKey, isGuestPassKey, PublicCaptcha, type CaptchaVerdict } from './checklist-public-captcha.js';
import { GUEST_USER_EMAIL, isEligibleForPublicAccess, PUBLIC_TOKEN_PATTERN } from './checklist-public-access.js';
import { presentLearnerInstance } from './checklist-learner-result.js';
import { ChecklistsService } from './checklists.service.js';
import type { FinishPublicChecklistInput, SkipChecklistItemInput, StartPublicChecklistInput, SubmitChecklistItemResultInput } from './checklists.schemas.js';

const ALLOWED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const DAY_MS = 24 * 60 * 60_000;
const GUEST_NAME_MAX = 80;
/** The limit is logged once per sheet and process per day, so a flood of refused scans does not flood the log. */
const LIMIT_LOG_INTERVAL_MS = DAY_MS;

type SheetRow = {
  id: string; organizationId: string; title: string; description: string | null; status: string; accessMode: string;
  publicAccess: 'off' | 'registered' | 'everyone'; publicToken: string; guestNameRequired: boolean; guestPhotosAllowed: boolean; publicDailyLimit: number;
};

const sheetSelect = {
  id: true, organizationId: true, title: true, description: true, status: true, accessMode: true, publicAccess: true, publicToken: true,
  guestNameRequired: true, guestPhotosAllowed: true, publicDailyLimit: true,
} as const;

function apiError(status: number, message: string, details?: Array<{ field?: string; code: string; message: string }>) {
  const body = { error: { code: statusCode(status), message, ...(details ? { details } : {}) } };
  return new HttpException(body, status);
}
const statusCode = (status: number) => (status === 401 ? 'UNAUTHORIZED' : status === 429 ? 'TOO_MANY_REQUESTS' : status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST');

const GUEST_HIDDEN_FIELDS = ['organizationId', 'userId', 'assignedBy', 'reviewerId', 'reviewAssignedAt', 'reviewAssignedBy'] as const;

/** What a guest may see of a pass: the sheet as the employee sees it, without who owns it or who organised it. */
export function presentGuestInstance<T>(instance: T): T {
  const shown = presentLearnerInstance(instance, false) as unknown;
  if (!shown || typeof shown !== 'object') return shown as T;
  const rest: Record<string, unknown> = { ...(shown as Record<string, unknown>) };
  for (const hidden of GUEST_HIDDEN_FIELDS) delete rest[hidden];
  return rest as T;
}

/**
 * PR 465: the operations of a guest who came by the permanent link or QR code. Everything starts from the token; nothing here
 * reaches another sheet, another organization or another guest's pass. A pass is proved by a key (HMAC of the pass and the
 * current token), so reissuing the link or switching the entry off stops every pass at once.
 */
@Injectable()
export class ChecklistPublicService {
  private readonly captcha: PublicCaptcha;
  private readonly limitLoggedAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly checklists: ChecklistsService,
    private readonly uploadService: UploadService,
    private readonly auditLog: AuditLogService,
  ) {
    this.captcha = new PublicCaptcha(getJwtSecret());
  }

  /** The sheet behind a token, or one answer for every reason it does not work (wrong, off, reissued, not published, not free). */
  private async resolve(token: string): Promise<SheetRow> {
    const notFound = () => new NotFoundException('This link is not valid');
    if (!PUBLIC_TOKEN_PATTERN.test(token)) throw notFound();
    const sheet = await this.prisma.checklist.findFirst({ where: { publicToken: token, deletedAt: null }, select: sheetSelect });
    if (!sheet || sheet.publicAccess === 'off' || !isEligibleForPublicAccess(sheet)) throw notFound();
    return sheet as SheetRow;
  }

  /** `registered`: the guest side is closed; the caller is sent to sign in and come back. */
  private requireOpenToGuests(sheet: SheetRow) {
    if (sheet.publicAccess === 'registered') {
      throw apiError(HttpStatus.UNAUTHORIZED, 'Sign in to open this checklist', [{ field: 'returnTo', code: 'LOGIN_REQUIRED', message: `/c/${sheet.publicToken}` }]);
    }
  }

  private checkCaptcha(challenge: string, code: string) {
    const verdict: CaptchaVerdict = this.captcha.verify(challenge, code);
    if (verdict === 'ok') return;
    throw apiError(HttpStatus.BAD_REQUEST, verdict === 'expired' ? 'The code has expired, request a new one' : 'The code is wrong', [{ field: 'captchaCode', code: verdict === 'expired' ? 'CAPTCHA_EXPIRED' : 'CAPTCHA_INVALID', message: verdict }]);
  }

  /** The front page of the link: what the sheet is and what a guest must give. */
  async open(token: string) {
    const sheet = await this.resolve(token);
    this.requireOpenToGuests(sheet);
    const criteriaCount = await this.prisma.checklistItem.count({ where: { checklistId: sheet.id, deletedAt: null } });
    return { title: sheet.title, description: sheet.description, criteriaCount, guestNameRequired: sheet.guestNameRequired, guestPhotosAllowed: sheet.guestPhotosAllowed, audience: sheet.publicAccess };
  }

  async newCaptcha(token: string) {
    const sheet = await this.resolve(token);
    this.requireOpenToGuests(sheet);
    return this.captcha.issue();
  }

  /** A signed-in employee who came by the link starts (or continues) the ordinary free pass under their own account. */
  async startAsUser(token: string, organizationId: string, userId: string) {
    const sheet = await this.resolve(token);
    if (sheet.organizationId !== organizationId) throw new NotFoundException('This link is not valid');
    return this.checklists.startFreeChecklist(sheet.id, organizationId, userId);
  }

  private async ensureGuestUser(organizationId: string): Promise<string> {
    const find = () => this.prisma.user.findFirst({ where: { organizationId, email: GUEST_USER_EMAIL }, select: { id: true } });
    const existing = await find();
    if (existing) return existing.id;
    try {
      // Archived: it never signs in and stays out of user lists; the password hash is not a valid hash, so no password matches.
      const created = await this.prisma.user.create({
        data: { organizationId, email: GUEST_USER_EMAIL, passwordHash: '!', firstName: 'Guest', lastName: 'Guest', status: 'archived' },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await find();
        if (raced) return raced.id;
      }
      throw error;
    }
  }

  private cleanName(input: string | undefined, required: boolean): string | null {
    // eslint-disable-next-line no-control-regex
    const name = (input ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) {
      if (required) throw new BadRequestException('Enter your name');
      return null;
    }
    if (name.length > GUEST_NAME_MAX) throw new BadRequestException(`The name is longer than ${GUEST_NAME_MAX} characters`);
    return name;
  }

  async start(token: string, input: StartPublicChecklistInput) {
    const sheet = await this.resolve(token);
    this.requireOpenToGuests(sheet);
    const guestName = this.cleanName(input.guestName, sheet.guestNameRequired);
    this.checkCaptcha(input.captchaChallenge, input.captchaCode);
    const guestUserId = await this.ensureGuestUser(sheet.organizationId);

    const instance = await this.prisma.$transaction(async (tx) => {
      // One start at a time per sheet, so the daily count cannot be passed by parallel requests.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('checklist-guest-start'), hashtext(${sheet.id}))`;
      const started = await tx.checklistInstance.count({ where: { checklistId: sheet.id, userId: guestUserId, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
      if (started >= sheet.publicDailyLimit) return null;
      const created = await this.checklists.assignChecklist(sheet.id, sheet.organizationId, { userId: guestUserId }, guestUserId, tx, { allowParallelActive: true });
      await tx.checklistInstance.update({ where: { id: created.id }, data: { guestName } });
      return { ...created, guestName };
    });

    if (!instance) {
      await this.logLimitReached(sheet);
      throw apiError(HttpStatus.TOO_MANY_REQUESTS, 'The daily limit of passes of this checklist is reached, try again tomorrow', [{ code: 'DAILY_LIMIT', message: String(sheet.publicDailyLimit) }]);
    }
    return { instanceId: instance.id, passKey: guestPassKey(getJwtSecret(), instance.id, sheet.publicToken), instance: presentGuestInstance(instance) };
  }

  private async logLimitReached(sheet: SheetRow) {
    const last = this.limitLoggedAt.get(sheet.id) ?? 0;
    if (Date.now() - last < LIMIT_LOG_INTERVAL_MS) return;
    this.limitLoggedAt.set(sheet.id, Date.now());
    await this.auditLog.record({
      organizationId: sheet.organizationId,
      actorId: null,
      action: 'checklist.public_access.limit_reached',
      targetType: 'checklist',
      targetId: sheet.id,
      summary: `The daily limit of guest passes was reached for checklist ${sheet.title}`,
      metadata: { dailyLimit: sheet.publicDailyLimit },
    });
  }

  /** The pass behind a key, or 404 for every reason (wrong key, other sheet, reissued link, finished-and-gone). */
  private async authorizePass(token: string, instanceId: string, passKey: string | undefined) {
    const sheet = await this.resolve(token);
    this.requireOpenToGuests(sheet);
    const notFound = () => new NotFoundException('This pass was not found');
    if (!passKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instanceId) || !isGuestPassKey(getJwtSecret(), instanceId, sheet.publicToken, passKey)) throw notFound();
    const guest = await this.prisma.user.findFirst({ where: { organizationId: sheet.organizationId, email: GUEST_USER_EMAIL }, select: { id: true } });
    const instance = guest ? await this.prisma.checklistInstance.findFirst({ where: { id: instanceId, organizationId: sheet.organizationId, checklistId: sheet.id, userId: guest.id, deletedAt: null }, select: { id: true } }) : null;
    if (!guest || !instance) throw notFound();
    return { sheet, guestUserId: guest.id };
  }

  async getPass(token: string, instanceId: string, passKey: string | undefined) {
    const { sheet } = await this.authorizePass(token, instanceId, passKey);
    return presentGuestInstance(await this.checklists.getInstance(instanceId, sheet.organizationId));
  }

  async submitItem(token: string, instanceId: string, itemId: string, passKey: string | undefined, input: SubmitChecklistItemResultInput) {
    const { sheet, guestUserId } = await this.authorizePass(token, instanceId, passKey);
    return presentGuestInstance(await this.checklists.submitItemResult(instanceId, itemId, sheet.organizationId, guestUserId, false, input));
  }

  async clearAnswer(token: string, instanceId: string, itemId: string, passKey: string | undefined) {
    const { sheet, guestUserId } = await this.authorizePass(token, instanceId, passKey);
    return presentGuestInstance(await this.checklists.clearItemAnswer(instanceId, itemId, sheet.organizationId, guestUserId, false));
  }

  async skipItem(token: string, instanceId: string, itemId: string, passKey: string | undefined, input: SkipChecklistItemInput) {
    const { sheet, guestUserId } = await this.authorizePass(token, instanceId, passKey);
    return presentGuestInstance(await this.checklists.skipItem(instanceId, itemId, sheet.organizationId, guestUserId, false, input));
  }

  /** Off unless the administrator allowed guest photos on this sheet; the screen hides the button, the server refuses regardless. */
  async attachPhoto(token: string, instanceId: string, itemId: string, passKey: string | undefined, file: Express.Multer.File | undefined) {
    const { sheet, guestUserId } = await this.authorizePass(token, instanceId, passKey);
    if (!sheet.guestPhotosAllowed) throw new ForbiddenException('Photos are not allowed for guests on this checklist');
    if (!file) throw new BadRequestException('No file provided');
    if (!ALLOWED_PHOTO_MIME_TYPES.has(file.mimetype)) throw new BadRequestException('Only image files (JPEG, PNG, GIF, WEBP) can be attached');
    validateUploadFile(file);
    await this.checklists.assertInstanceWritable(instanceId, sheet.organizationId, guestUserId, false);
    const uploaded = await this.uploadService.uploadChecklistItemPhoto(file, sheet.organizationId, instanceId, itemId);
    try {
      return presentGuestInstance(await this.checklists.attachItemPhoto(instanceId, itemId, sheet.organizationId, guestUserId, false, uploaded));
    } catch (error) {
      await this.uploadService.deleteObject(uploaded.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async finish(token: string, instanceId: string, passKey: string | undefined, input: FinishPublicChecklistInput) {
    const { sheet, guestUserId } = await this.authorizePass(token, instanceId, passKey);
    this.checkCaptcha(input.captchaChallenge, input.captchaCode);
    return presentGuestInstance(await this.checklists.finishInstance(instanceId, sheet.organizationId, guestUserId, false));
  }
}

