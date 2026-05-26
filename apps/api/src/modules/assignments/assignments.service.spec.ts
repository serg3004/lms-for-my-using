import { createAssignmentSchema } from './assignments.schemas.js';

describe('Assignments validation', () => {
  it('accepts valid assignment input for user target', () => {
    const input = createAssignmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
      status: 'assigned',
    });
  });

  it('accepts valid assignment input for group target with due date', () => {
    const input = createAssignmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      groupId: '44444444-4444-4444-4444-444444444444',
      dueAt: '2026-06-01T09:00:00.000Z',
    });

    expect(input.groupId).toBe('44444444-4444-4444-4444-444444444444');
    expect(input.dueAt).toEqual(new Date('2026-06-01T09:00:00.000Z'));
  });

  it('rejects assignment input without target', () => {
    expect(() =>
      createAssignmentSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
      }),
    ).toThrow();
  });

  it('rejects assignment input with both targets', () => {
    expect(() =>
      createAssignmentSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        groupId: '44444444-4444-4444-4444-444444444444',
      }),
    ).toThrow();
  });
});
