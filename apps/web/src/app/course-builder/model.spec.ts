import { describe, expect, it } from 'vitest';
import { toCourseMutation, validateCourseForm, validateLessonForm } from './model.js';

describe('course builder model', () => {
  it('validates course and lesson titles', () => {
    expect(validateCourseForm({ title: ' ', description: '' })).toEqual({ title: 'Course title is required' });
    expect(validateLessonForm({ title: '---', description: '' })).toEqual({ title: 'Enter a title using letters or numbers.' });
    expect(validateLessonForm({ title: 'Lesson 1', description: '' })).toEqual({});
  });

  it('normalizes the course mutation', () => {
    expect(toCourseMutation({ title: ' Course ', description: ' ' })).toEqual({ title: 'Course', description: undefined });
  });
});
