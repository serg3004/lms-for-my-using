import { describe, expect, it } from 'vitest';
import { lessonSlug } from './lessonSlug.js';

describe('lesson identifiers', () => {
  it.each(['Безопасная работа', 'Қауіпсіздік', '安全操作', 'Я', '1', 'ab'])('accepts localized and short titles: %s', (title) => {
    const slug = lessonSlug(title);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(slug.length).toBeGreaterThanOrEqual(3);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(lessonSlug(title)).not.toBe(slug);
  });

  it('retains valid readable slugs and removes a separator left by truncation', () => {
    expect(lessonSlug('Fire Safety')).toBe('fire-safety');
    expect(lessonSlug(`${'a'.repeat(79)} b`)).toBe('a'.repeat(79));
  });
});
