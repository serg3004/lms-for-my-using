import { describe, expect, it } from 'vitest';

import { sortLessons } from './sortLessons.js';

describe('sortLessons', () => {
  it('sorts by order ascending', () => {
    const lessons = [
      { id: '3', order: 3, title: 'C' },
      { id: '1', order: 1, title: 'A' },
      { id: '2', order: 2, title: 'B' },
    ];
    expect(sortLessons(lessons).map((l) => l.order)).toEqual([1, 2, 3]);
  });

  it('sorts by title when order is equal', () => {
    const lessons = [
      { id: '2', order: 1, title: 'Zebra' },
      { id: '1', order: 1, title: 'Alpha' },
    ];
    expect(sortLessons(lessons).map((l) => l.title)).toEqual(['Alpha', 'Zebra']);
  });

  it('returns a new array without mutating the original', () => {
    const lessons = [
      { id: '2', order: 2, title: 'B' },
      { id: '1', order: 1, title: 'A' },
    ];
    const original = [...lessons];
    sortLessons(lessons);
    expect(lessons).toEqual(original);
  });

  it('handles an empty array', () => {
    expect(sortLessons([])).toEqual([]);
  });
});
