import { releaseSlugOnDelete } from './soft-delete-slug.js';

describe('releaseSlugOnDelete', () => {
  it('appends the row id and a random suffix so the original slug can be reused', () => {
    const result = releaseSlugOnDelete('safety-basics', 'abc-123');

    expect(result).toMatch(/^safety-basics--deleted-abc-123-[0-9a-f-]{36}$/);
  });

  it('produces a different value on each call, so a pre-planted tombstone slug cannot collide', () => {
    const first = releaseSlugOnDelete('safety-basics', 'abc-123');
    const second = releaseSlugOnDelete('safety-basics', 'abc-123');

    expect(first).not.toBe(second);
  });
});
