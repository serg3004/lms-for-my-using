import { createMembershipSchema } from './memberships.schemas.js';

describe('Memberships validation', () => {
  it('accepts valid membership input', () => {
    const input = createMembershipSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'learner',
      assignedBy: '33333333-3333-3333-3333-333333333333',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'learner',
      assignedBy: '33333333-3333-3333-3333-333333333333',
    });
  });

  it('rejects invalid membership role', () => {
    expect(() =>
      createMembershipSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        role: 'owner',
      }),
    ).toThrow();
  });
});
