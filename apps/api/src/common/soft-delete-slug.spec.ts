import { releaseSlugOnDelete } from './soft-delete-slug.js';

describe('releaseSlugOnDelete', () => {
  it('appends the row id to the slug so the original slug can be reused', () => {
    expect(releaseSlugOnDelete('safety-basics', 'abc-123')).toBe('safety-basics--deleted-abc-123');
  });
});
