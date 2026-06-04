import { createAssessmentSchema, updateAssessmentSchema, updateAssessmentStatusSchema } from './assessments.schemas.js';

describe('Assessments validation', () => {
  it('accepts valid assessment input for future automatic grading', () => {
    const input = createAssessmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Final test',
      slug: 'final-test',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      title: 'Final test',
      slug: 'final-test',
      status: 'draft',
      passingScore: 70,
      availableAfterCourseCompletion: true,
    });
  });

  it('accepts valid assessment input with lesson and attempts limit', () => {
    const input = createAssessmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      lessonId: '33333333-3333-3333-3333-333333333333',
      title: 'Lesson quiz',
      slug: 'lesson-quiz',
      passingScore: 80,
      maxAttempts: 3,
      availableAfterCourseCompletion: false,
    });

    expect(input.lessonId).toBe('33333333-3333-3333-3333-333333333333');
    expect(input.passingScore).toBe(80);
    expect(input.maxAttempts).toBe(3);
    expect(input.availableAfterCourseCompletion).toBe(false);
  });

  it('rejects assessment input without title', () => {
    expect(() =>
      createAssessmentSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        slug: 'final-test',
      }),
    ).toThrow();
  });

  it('rejects invalid passing score', () => {
    expect(() =>
      createAssessmentSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        title: 'Final test',
        slug: 'final-test',
        passingScore: 101,
      }),
    ).toThrow();
  });
});

describe('updateAssessmentStatusSchema', () => {
  it('accepts valid status', () => {
    expect(updateAssessmentStatusSchema.parse({ status: 'published' })).toEqual({ status: 'published' });
  });

  it('rejects unknown status', () => {
    expect(() => updateAssessmentStatusSchema.parse({ status: 'active' })).toThrow();
  });
});

describe('updateAssessmentSchema', () => {
  it('accepts partial update', () => {
    expect(updateAssessmentSchema.parse({ passingScore: 80, status: 'published' })).toEqual({
      passingScore: 80,
      status: 'published',
    });
  });

  it('accepts maxAttempts null to remove limit', () => {
    expect(updateAssessmentSchema.parse({ maxAttempts: null })).toEqual({ maxAttempts: null });
  });

  it('accepts empty object', () => {
    expect(updateAssessmentSchema.parse({})).toEqual({});
  });
});
