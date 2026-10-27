import '../i18n/index.js';

import i18n from 'i18next';
import { describe, expect, it } from 'vitest';

import { MAX_BUFFERED_UPLOAD_SIZE_BYTES } from './apiClient.js';
import {
  CHECKLIST_PHOTO_ACCEPT,
  CHECKLIST_PHOTO_MAX_BYTES,
  CHECKLIST_PHOTO_MAX_MB,
  checklistPhotoErrorMessage,
  checklistPhotoHint,
  validateChecklistPhoto,
} from './checklistPhoto.js';

describe('checklist photo pre-check (PR 348)', () => {
  it('reuses the buffered upload limit instead of a second number', () => {
    expect(CHECKLIST_PHOTO_MAX_BYTES).toBe(MAX_BUFFERED_UPLOAD_SIZE_BYTES);
    expect(CHECKLIST_PHOTO_MAX_MB).toBe(8);
    expect(CHECKLIST_PHOTO_ACCEPT).toBe('image/jpeg,image/png,image/gif,image/webp');
  });

  it('accepts the four image types up to the limit and rejects the rest with a reason', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
      expect(validateChecklistPhoto({ type, size: 1 })).toBeNull();
      expect(validateChecklistPhoto({ type, size: CHECKLIST_PHOTO_MAX_BYTES })).toBeNull();
    }
    expect(validateChecklistPhoto({ type: 'image/png', size: CHECKLIST_PHOTO_MAX_BYTES + 1 })).toBe('too-large');
    expect(validateChecklistPhoto({ type: 'image/png', size: 0 })).toBe('empty');
    expect(validateChecklistPhoto({ type: 'application/pdf', size: 10 })).toBe('unsupported-type');
    expect(validateChecklistPhoto({ type: 'image/heic', size: 10 })).toBe('unsupported-type');
    expect(validateChecklistPhoto({ type: '', size: 10 })).toBe('unsupported-type');
  });

  it.each(['ru', 'en', 'kk', 'zh'])('has localized messages and hints with the limit in %s', async (locale) => {
    await i18n.changeLanguage(locale);
    const t = i18n.t.bind(i18n) as never;
    for (const error of ['too-large', 'empty', 'unsupported-type'] as const) {
      const message = checklistPhotoErrorMessage(error, t);
      expect(message).not.toMatch(/^checklists\./);
      expect(message.length).toBeGreaterThan(0);
    }
    expect(checklistPhotoErrorMessage('too-large', t)).toContain('8');
    expect(checklistPhotoHint(false, t)).toContain('8');
    expect(checklistPhotoHint(true, t).length).toBeGreaterThan(checklistPhotoHint(false, t).length);
    expect(checklistPhotoHint(true, t)).not.toMatch(/checklists\./);
  });
});
