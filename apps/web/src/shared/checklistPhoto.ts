import type { TFunction } from 'i18next';

import { ApiClientError, MAX_BUFFERED_UPLOAD_SIZE_BYTES } from './apiClient.js';

/**
 * Client-side pre-check for checklist item photos (PR 348). The server stays authoritative:
 * `MAX_BUFFERED_UPLOAD_SIZE_BYTES` and `ALLOWED_ITEM_PHOTO_MIME_TYPES` in the API, kept equal to
 * these by `checklist-photo-limits.parity.spec.ts` (the web app cannot import API source).
 */
export const CHECKLIST_PHOTO_MAX_BYTES = MAX_BUFFERED_UPLOAD_SIZE_BYTES;
export const CHECKLIST_PHOTO_MAX_MB = Math.floor(CHECKLIST_PHOTO_MAX_BYTES / (1024 * 1024));
export const CHECKLIST_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export const CHECKLIST_PHOTO_ACCEPT = CHECKLIST_PHOTO_TYPES.join(',');

/** PR 421: extra pictures of a sheet; kept equal to the API's `MAX_SHEET_PHOTOS` and caption length. */
export const MAX_CHECKLIST_PHOTOS = 6;
export const CHECKLIST_PHOTO_CAPTION_MAX_LENGTH = 200;

export type ChecklistPhotoError = 'unsupported-type' | 'empty' | 'too-large';

export function validateChecklistPhoto(file: { type: string; size: number }): ChecklistPhotoError | null {
  if (!(CHECKLIST_PHOTO_TYPES as readonly string[]).includes(file.type)) return 'unsupported-type';
  if (file.size === 0) return 'empty';
  if (file.size > CHECKLIST_PHOTO_MAX_BYTES) return 'too-large';
  return null;
}

export function checklistPhotoErrorMessage(error: ChecklistPhotoError, t: TFunction): string {
  switch (error) {
    case 'too-large': return t('checklists.photoTooLarge', 'The file is larger than {{max}} MB. Choose a smaller photo.', { max: CHECKLIST_PHOTO_MAX_MB });
    case 'empty': return t('checklists.photoEmpty', 'The file is empty. Choose another photo.');
    default: return t('checklists.photoUnsupportedType', 'Only JPEG, PNG, GIF and WEBP photos can be attached.');
  }
}

export function checklistPhotoHint(cameraOnly: boolean, t: TFunction): string {
  const limit = t('checklists.photoLimitHint', 'Photo: JPEG, PNG, GIF or WEBP, up to {{max}} MB.', { max: CHECKLIST_PHOTO_MAX_MB });
  return cameraOnly
    ? `${limit} ${t('checklists.photoCameraOnlyHint', 'The photo can only be taken with the camera. This is an interface restriction, not a server check.')}`
    : limit;
}

/** PR 432: an upload that did not finish in time says what to do, in the interface language, instead of "Request timed out". */
export function checklistUploadErrorMessage(error: unknown, fallback: string, t: TFunction): string {
  if (error instanceof ApiClientError) {
    return error.status === 408
      ? t('checklists.photoUploadTimeout', 'The image was not uploaded in time. Check the network and try again.')
      : error.message;
  }
  return fallback;
}

/** A timeout or a lost connection is worth another attempt with the same file; a rejection by the server is not. */
export function isRetryableUploadError(error: unknown): boolean {
  return !(error instanceof ApiClientError) || error.status === 408;
}
