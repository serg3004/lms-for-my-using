import { createGroupSchema } from './groups.schemas.js';

describe('Groups validation', () => {
  it('accepts valid group input', () => {
    const input = createGroupSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      name: 'Sales Team',
      slug: 'sales-team',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      name: 'Sales Team',
      slug: 'sales-team',
      status: 'active',
    });
  });

  it('rejects invalid group slug', () => {
    expect(() =>
      createGroupSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        name: 'Sales Team',
        slug: 'Sales Team',
      }),
    ).toThrow();
  });
});
