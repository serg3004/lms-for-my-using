import { describe, expect, it } from 'vitest';

import { filterLessons, parseLessonOrder } from './model.js';

const lessons = [
  { title: 'Введение в безопасность', type: 'video' },
  { title: 'Правила эвакуации', type: 'text' },
  { title: 'Роли в команде', type: 'video' },
];

describe('admin lessons model', () => {
  it('filters by case-insensitive title search', () => {
    expect(filterLessons(lessons, 'эвакуации', 'all')).toEqual([lessons[1]]);
    expect(filterLessons(lessons, 'ВВЕДЕНИЕ', 'all')).toEqual([lessons[0]]);
  });

  it('filters by type', () => {
    expect(filterLessons(lessons, '', 'video')).toEqual([lessons[0], lessons[2]]);
    expect(filterLessons(lessons, '', 'text')).toEqual([lessons[1]]);
  });

  it('combines search and type filters', () => {
    expect(filterLessons(lessons, 'роли', 'video')).toEqual([lessons[2]]);
    expect(filterLessons(lessons, 'роли', 'text')).toEqual([]);
  });

  it('returns everything for an empty search and "all" type', () => {
    expect(filterLessons(lessons, '', 'all')).toEqual(lessons);
  });

  it('parses a non-negative integer order', () => {
    expect(parseLessonOrder('0')).toBe(0);
    expect(parseLessonOrder('5')).toBe(5);
  });

  it('rejects negative, fractional, or non-numeric order values', () => {
    expect(parseLessonOrder('-1')).toBeNull();
    expect(parseLessonOrder('1.5')).toBeNull();
    expect(parseLessonOrder('abc')).toBeNull();
  });
});
