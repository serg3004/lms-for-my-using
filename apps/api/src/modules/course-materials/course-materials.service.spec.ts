import { createCourseMaterialSchema } from './course-materials.schemas.js';

describe('Course materials validation', () => {
  it('accepts valid course material input without lesson', () => {
    const input = createCourseMaterialSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Safety PDF',
      slug: 'safety-pdf',
      fileUrl: 'https://example.com/safety.pdf',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Safety PDF',
      slug: 'safety-pdf',
      kind: 'file',
      fileUrl: 'https://example.com/safety.pdf',
      status: 'active',
    });
  });

  it('accepts valid course material input with lesson', () => {
    const input = createCourseMaterialSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      lessonId: '33333333-3333-3333-3333-333333333333',
      title: 'Intro Video',
      slug: 'intro-video',
      kind: 'link',
      fileUrl: 'https://example.com/intro',
    });

    expect(input.lessonId).toBe('33333333-3333-3333-3333-333333333333');
  });

  it('rejects invalid material slug', () => {
    expect(() =>
      createCourseMaterialSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        title: 'Safety PDF',
        slug: 'Safety PDF',
        fileUrl: 'https://example.com/safety.pdf',
      }),
    ).toThrow();
  });
});
