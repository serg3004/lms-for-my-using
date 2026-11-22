import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { rolePolicies } from '../auth/public.js';
import { ManagerTeamScope } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';
import { UploadService, validateUploadFile } from '../upload/public.js';
import { processProfilePhoto } from './profile-photo.js';
import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_MIME_TYPES, type UpdateOwnProfileInput } from './profile.schemas.js';

const profileSelect = { phone: true, locale: true, timezone: true, aboutMe: true, photoMimeType: true, profileVersion: true } as const;

type ProfileRow = { phone: string | null; locale: string; timezone: string; aboutMe: string | null; photoMimeType: string | null; profileVersion: number };

function toProfile(row: ProfileRow) {
  return { phone: row.phone, locale: row.locale, timezone: row.timezone, aboutMe: row.aboutMe, hasPhoto: row.photoMimeType !== null, version: row.profileVersion };
}

/** PR 496: a person's own profile: the few fields they may edit, their photo, and who may see the photo. */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
    private readonly teamScope: ManagerTeamScope = new ManagerTeamScope(),
  ) {}

  async getOwnProfile(userId: string, organizationId: string) {
    const row = await this.prisma.user.findFirst({ where: { id: userId, organizationId, deletedAt: null }, select: profileSelect });
    if (!row) throw new NotFoundException('User not found');
    return toProfile(row);
  }

  async updateOwnProfile(userId: string, organizationId: string, input: UpdateOwnProfileInput) {
    const current = await this.prisma.user.findFirst({ where: { id: userId, organizationId, deletedAt: null }, select: profileSelect });
    if (!current) throw new NotFoundException('User not found');
    if (current.profileVersion !== input.version) throw new ConflictException('The profile was changed elsewhere. Reload it and try again');

    const data: { phone?: string | null; locale?: string; timezone?: string; aboutMe?: string | null } = {};
    if (input.phone !== undefined && (input.phone || null) !== current.phone) data.phone = input.phone || null;
    if (input.locale !== undefined && input.locale !== current.locale) data.locale = input.locale;
    if (input.timezone !== undefined && input.timezone !== current.timezone) data.timezone = input.timezone;
    if (input.aboutMe !== undefined && (input.aboutMe || null) !== current.aboutMe) data.aboutMe = input.aboutMe || null;
    const changed = Object.keys(data);
    if (changed.length === 0) return toProfile(current);

    // The version in the WHERE clause makes two simultaneous saves safe: the second one updates nothing and gets a 409.
    const result = await this.prisma.user.updateMany({
      where: { id: userId, organizationId, profileVersion: input.version },
      data: { ...data, profileVersion: { increment: 1 } },
    });
    if (result.count === 0) throw new ConflictException('The profile was changed elsewhere. Reload it and try again');

    await this.auditLog.record({
      organizationId,
      actorId: userId,
      action: 'user.profile_updated',
      targetType: 'user',
      targetId: userId,
      summary: `User changed own profile fields: ${changed.join(', ')}`,
      // Field names only: phone numbers and notes are personal data and do not belong in the audit trail.
      metadata: { fields: changed },
    });
    return this.getOwnProfile(userId, organizationId);
  }

  async setOwnPhoto(userId: string, organizationId: string, file: Express.Multer.File) {
    if (!PROFILE_PHOTO_MIME_TYPES.has(file.mimetype)) throw new BadRequestException('The photo must be a JPEG, PNG or WebP image');
    if (file.size > PROFILE_PHOTO_MAX_BYTES) throw new BadRequestException('The photo must not be larger than 1 MB');
    validateUploadFile(file);

    const previous = await this.prisma.user.findFirst({ where: { id: userId, organizationId, deletedAt: null }, select: { photoObjectKey: true, photoThumbObjectKey: true } });
    if (!previous) throw new NotFoundException('User not found');

    // Both variants are re-encoded here: what is stored is a trimmed picture and a square thumbnail, never the uploaded bytes.
    const photo = await processProfilePhoto(file.buffer);
    const [fullKey, thumbKey] = await Promise.all([
      this.upload.uploadUserPhoto(photo.full, photo.mimeType, organizationId, userId, 'full'),
      this.upload.uploadUserPhoto(photo.thumb, photo.mimeType, organizationId, userId, 'thumb'),
    ]);
    await this.prisma.user.update({
      where: { id: userId, organizationId },
      data: { photoObjectKey: fullKey, photoThumbObjectKey: thumbKey, photoMimeType: photo.mimeType, profileVersion: { increment: 1 } },
    });
    await this.deleteStored([previous.photoObjectKey, previous.photoThumbObjectKey]);

    await this.auditLog.record({ organizationId, actorId: userId, action: 'user.photo_changed', targetType: 'user', targetId: userId, summary: 'User changed own photo' });
    return this.getOwnProfile(userId, organizationId);
  }

  async removeOwnPhoto(userId: string, organizationId: string) {
    const current = await this.prisma.user.findFirst({ where: { id: userId, organizationId, deletedAt: null }, select: { photoObjectKey: true, photoThumbObjectKey: true } });
    if (!current) throw new NotFoundException('User not found');
    if (!current.photoObjectKey) return this.getOwnProfile(userId, organizationId);

    await this.prisma.user.update({ where: { id: userId, organizationId }, data: { photoObjectKey: null, photoThumbObjectKey: null, photoMimeType: null, profileVersion: { increment: 1 } } });
    await this.deleteStored([current.photoObjectKey, current.photoThumbObjectKey]);
    await this.auditLog.record({ organizationId, actorId: userId, action: 'user.photo_removed', targetType: 'user', targetId: userId, summary: 'User removed own photo' });
    return this.getOwnProfile(userId, organizationId);
  }

  /** The photo is visible to its owner and to those who may read that user (administrator; manager within the team). */
  async getPhotoFile(targetId: string, actor: TeamScopeActor, size: 'full' | 'thumb' = 'full') {
    const own = targetId === actor.id;
    if (!own && !actor.roles.some((role) => (rolePolicies.usersRead as readonly string[]).includes(role))) throw new NotFoundException('Photo not found');

    const user = await this.prisma.user.findFirst({
      where: { id: targetId, organizationId: actor.organizationId, deletedAt: null, ...(own ? {} : this.teamScope.user(actor)) },
      select: { photoObjectKey: true, photoThumbObjectKey: true, photoMimeType: true, profileVersion: true },
    });
    const key = size === 'thumb' ? user?.photoThumbObjectKey ?? user?.photoObjectKey : user?.photoObjectKey;
    if (!user || !key || !user.photoMimeType) throw new NotFoundException('Photo not found');

    const bytes = await this.upload.getObjectBytes(key, PROFILE_PHOTO_MAX_BYTES * 2);
    if (!bytes) throw new NotFoundException('Photo not found');
    return { bytes, mimeType: user.photoMimeType, version: user.profileVersion };
  }

  private async deleteStored(keys: Array<string | null>) {
    await Promise.all(keys.filter((key): key is string => key !== null).map((key) => this.upload.deleteObject(key).catch(() => undefined)));
  }
}
