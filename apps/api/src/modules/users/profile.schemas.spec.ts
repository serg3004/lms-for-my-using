import { PROFILE_PHOTO_MIME_TYPES, updateOwnProfileSchema } from './profile.schemas.js';

describe('updateOwnProfileSchema (PR 496)', () => {
  it('accepts the allowed fields', () => {
    expect(updateOwnProfileSchema.parse({ version: 2, phone: '+7 (701) 123-45-67', locale: 'kk', timezone: 'Asia/Almaty', aboutMe: '  Люблю учиться  ' }))
      .toEqual({ version: 2, phone: '+7 (701) 123-45-67', locale: 'kk', timezone: 'Asia/Almaty', aboutMe: 'Люблю учиться' });
  });

  it('refuses every field a person may not change on their own', () => {
    for (const field of ['firstName', 'lastName', 'email', 'position', 'shift', 'status', 'role', 'organizationId', 'photoObjectKey', 'profileVersion']) {
      expect(updateOwnProfileSchema.safeParse({ version: 0, [field]: 'x' }).success).toBe(false);
    }
  });

  it('checks the phone format, the time zone and the length of the note', () => {
    expect(updateOwnProfileSchema.safeParse({ version: 0, phone: 'call me' }).success).toBe(false);
    expect(updateOwnProfileSchema.safeParse({ version: 0, phone: '' }).success).toBe(true);
    expect(updateOwnProfileSchema.safeParse({ version: 0, timezone: 'Mars/Base' }).success).toBe(false);
    expect(updateOwnProfileSchema.safeParse({ version: 0, aboutMe: 'a'.repeat(501) }).success).toBe(false);
    expect(updateOwnProfileSchema.safeParse({ version: 0, aboutMe: 'a'.repeat(500) }).success).toBe(true);
    expect(updateOwnProfileSchema.safeParse({ version: -1 }).success).toBe(false);
    expect(updateOwnProfileSchema.safeParse({ phone: '12345' }).success).toBe(false);
  });

  it('drops control characters from the note', () => {
    expect(updateOwnProfileSchema.parse({ version: 0, aboutMe: 'a\u0000b\u0007c\nd' }).aboutMe).toBe('abc\nd');
  });

  it('allows only JPEG, PNG and WebP photos', () => {
    expect([...PROFILE_PHOTO_MIME_TYPES].sort()).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
});
