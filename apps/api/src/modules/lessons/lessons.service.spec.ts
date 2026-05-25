import { createLessonSchema } from './lessons.schemas.js';

describe('Lessons validation', () => {
  it('accepts valid lesson input', () => {
    const input = createLessonSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Intro',
      slug: 'intro',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Intro',
      slug: 'intro',
      order: 0,
      status: 'draft',
    });
  });

  it('rejects invalid lesson slug', () => {
    expect(() =>
      createLessonSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        title: 'Intro',
        slug: 'Intro Lesson',
      }),
    ).toThrow();
  });
});
