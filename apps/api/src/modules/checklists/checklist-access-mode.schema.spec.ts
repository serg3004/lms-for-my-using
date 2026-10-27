import { createChecklistSchema, updateChecklistSchema } from './checklists.schemas.js';

const organizationId = '11111111-1111-1111-1111-111111111111';

describe('checklist access mode schema (PR 353)', () => {
  it('defaults a new checklist to the assigned mode', () => {
    expect(createChecklistSchema.parse({ organizationId, title: 'Sheet' }).accessMode).toBe('assigned');
  });

  it('accepts the free mode on create and update', () => {
    expect(createChecklistSchema.parse({ organizationId, title: 'Sheet', accessMode: 'free' }).accessMode).toBe('free');
    expect(updateChecklistSchema.parse({ accessMode: 'free' })).toEqual({ accessMode: 'free' });
  });

  it('does not touch the mode on a partial update without it', () => {
    expect(updateChecklistSchema.parse({ title: 'Renamed' })).toEqual({ title: 'Renamed' });
  });

  it('rejects an unknown mode', () => {
    expect(() => createChecklistSchema.parse({ organizationId, title: 'Sheet', accessMode: 'public' })).toThrow();
    expect(() => updateChecklistSchema.parse({ accessMode: 'public' })).toThrow();
  });
});

describe('checklist pinned flag schema (PR 354)', () => {
  it('accepts pinned only on update, as a boolean', () => {
    expect(updateChecklistSchema.parse({ pinned: true })).toEqual({ pinned: true });
    expect(() => updateChecklistSchema.parse({ pinned: 'yes' })).toThrow();
    expect('pinned' in createChecklistSchema.parse({ organizationId, title: 'Sheet' })).toBe(false);
  });
});
