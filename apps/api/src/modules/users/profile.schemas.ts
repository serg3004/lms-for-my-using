import { z } from 'zod';

const phonePattern = /^\+?[0-9][0-9 ()-]{3,23}[0-9]$/;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Control characters other than a line break or tab are dropped from free text. */
function cleanText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

/**
 * PR 496: what a person may change in their own profile. The schema is strict, so a name, email, position, shift, role
 * or any other field is refused with a 400 instead of being ignored.
 */
export const updateOwnProfileSchema = z.object({
  /** The `version` the screen last read; a different one means the profile was changed elsewhere (409). */
  version: z.number().int().min(0),
  phone: z.string().transform(cleanText).refine((value) => value === '' || phonePattern.test(value), 'Phone number format is invalid').nullable().optional(),
  locale: z.enum(['ru', 'en', 'kk', 'zh']).optional(),
  timezone: z.string().trim().min(1).max(64).refine(isTimeZone, 'Unknown time zone').optional(),
  aboutMe: z.string().transform(cleanText).refine((value) => value.length <= 500, 'About me is limited to 500 characters').nullable().optional(),
}).strict();

export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;

export const PROFILE_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const PROFILE_PHOTO_MAX_BYTES = 1_048_576;
