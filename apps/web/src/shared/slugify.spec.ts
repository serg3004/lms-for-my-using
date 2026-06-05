import { describe, expect, it } from 'vitest';

import { slugify } from './slugify.js';

describe('slugify', () => {
  it('lowercases and trims whitespace', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world');
  });

  it('replaces spaces and special chars with hyphens', () => {
    expect(slugify('Fire Safety: Basics & Tips!')).toBe('fire-safety-basics-tips');
  });

  it('collapses multiple separators into one hyphen', () => {
    expect(slugify('course -- advanced')).toBe('course-advanced');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('---title---')).toBe('title');
  });

  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long)).toHaveLength(80);
  });

  it('returns empty string for blank input', () => {
    expect(slugify('   ')).toBe('');
  });

  it('preserves digits', () => {
    expect(slugify('Module 3 Part 2')).toBe('module-3-part-2');
  });

  it('handles cyrillic and unicode by removing them', () => {
    expect(slugify('Урок 1')).toBe('1');
  });
});
