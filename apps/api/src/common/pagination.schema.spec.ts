import { cursorPaginationQuerySchema, paginationQuerySchema } from './pagination.schema.js';

describe('pagination query schemas', () => {
  it('bounds offset pagination', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(paginationQuerySchema.safeParse({ pageSize: 201 }).success).toBe(false);
  });

  it('parses a bounded cursor page', () => {
    const cursor = 'd9428888-122b-11e1-b85c-61cd3cbb3210';
    expect(cursorPaginationQuerySchema.parse({ cursor, limit: '50' })).toEqual({ cursor, limit: 50 });
    expect(cursorPaginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(cursorPaginationQuerySchema.safeParse({ cursor: 'not-an-id' }).success).toBe(false);
  });
});
