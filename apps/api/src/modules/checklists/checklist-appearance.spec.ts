import { appearanceSchema, createChecklistSchema, updateChecklistSchema } from './checklists.schemas.js';
import { kindAppearance } from './checklist-appearance.js';

const id = '3f2b8c1e-5d4a-4b6f-9a7c-1e2d3c4b5a69';
const org = '0f2b8c1e-5d4a-4b6f-9a7c-1e2d3c4b5a60';

describe('checklist appearance on the server (PR 422)', () => {
  it('cuts values outside the allowed set instead of storing them', () => {
    const parsed = appearanceSchema.parse({ blocks: { item: { color: 'url(x)', background: '#aabbcc', borderWidth: 40, radius: 99 }, evil: { color: '#000000' } }, overrides: { 'x': { color: '#000000' }, [id]: { padding: 16 } } });
    expect(parsed).toEqual({ blocks: { item: { background: '#AABBCC' } }, overrides: { [id]: { padding: 16 } } });
  });
  it('turns junk into null and rejects an oversized document', () => {
    expect(appearanceSchema.parse('<script>')).toBeNull();
    expect(appearanceSchema.safeParse({ blocks: { item: { color: '#111111' } }, junk: 'x'.repeat(50000) }).success).toBe(false);
  });
  it('is accepted on create and update, and null clears it', () => {
    expect(createChecklistSchema.parse({ organizationId: org, title: 'A', appearance: { blocks: { header: { color: '#111111' } } } }).appearance).toEqual({ blocks: { header: { color: '#111111' } } });
    expect(updateChecklistSchema.parse({ appearance: null }).appearance).toBeNull();
    expect(updateChecklistSchema.parse({}).appearance).toBeUndefined();
  });
  it('a copy or template keeps kinds but drops per-block overrides', () => {
    expect(kindAppearance({ blocks: { item: { color: '#111111' } }, overrides: { [id]: { color: '#222222' } } })).toEqual({ blocks: { item: { color: '#111111' } } });
    expect(kindAppearance({ overrides: { [id]: { color: '#222222' } } })).toBeNull();
    expect(kindAppearance(null)).toBeNull();
  });
});
