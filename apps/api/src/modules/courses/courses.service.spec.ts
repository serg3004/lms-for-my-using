import { createCourseSchema } from './courses.schemas.js';

describe('Courses validation', () => {
  it('accepts valid course input', () => {
    const input = createCourseSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      title: 'Safety Basics',
      slug: 'safety-basics',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      title: 'Safety Basics',
      slug: 'safety-basics',
      status: 'draft',
    });
  });

  it('rejects invalid course slug', () => {
    expect(() =>
      createCourseSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        title: 'Safety Basics',
        slug: 'Safety Basics',
      }),
    ).toThrow();
  });
});
