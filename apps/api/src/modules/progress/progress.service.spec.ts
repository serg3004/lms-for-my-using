import { createProgressSchema } from './progress.schemas.js';

describe('Progress validation', () => {
  it('accepts valid progress input without lesson', () => {
    const input = createProgressSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
      status: 'in_progress',
    });
  });

  it('accepts valid progress input with lesson, score, and completion date', () => {
    const input = createProgressSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      lessonId: '44444444-4444-4444-4444-444444444444',
      userId: '33333333-3333-3333-3333-333333333333',
      status: 'completed',
      score: 95,
      completedAt: '2026-06-01T09:00:00.000Z',
    });

    expect(input.lessonId).toBe('44444444-4444-4444-4444-444444444444');
    expect(input.score).toBe(95);
    expect(input.completedAt).toEqual(new Date('2026-06-01T09:00:00.000Z'));
  });

  it('rejects progress input without user', () => {
    expect(() =>
      createProgressSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
      }),
    ).toThrow();
  });

  it('rejects invalid progress score', () => {
    expect(() =>
      createProgressSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        score: 101,
      }),
    ).toThrow();
  });
});
