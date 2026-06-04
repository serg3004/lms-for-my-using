import { createLessonSchema, updateLessonSchema, updateLessonStatusSchema } from './lessons.schemas.js';

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

describe('updateLessonStatusSchema', () => {
  it('accepts valid status', () => {
    expect(updateLessonStatusSchema.parse({ status: 'published' })).toEqual({ status: 'published' });
  });

  it('rejects unknown status', () => {
    expect(() => updateLessonStatusSchema.parse({ status: 'active' })).toThrow();
  });
});

describe('updateLessonSchema', () => {
  it('accepts partial update', () => {
    expect(updateLessonSchema.parse({ title: 'New title', order: 2 })).toEqual({ title: 'New title', order: 2 });
  });

  it('accepts description null to clear it', () => {
    expect(updateLessonSchema.parse({ description: null })).toEqual({ description: null });
  });

  it('accepts empty object (no-op update)', () => {
    expect(updateLessonSchema.parse({})).toEqual({});
  });
});
