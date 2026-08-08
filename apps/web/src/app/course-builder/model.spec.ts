import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import '../../i18n/index.js';
import { toCourseMutation, validateCourseForm, validateLessonForm } from './model.js';

describe('course builder model', () => {
  it('validates course and lesson titles', () => {
    expect(validateCourseForm({ title: ' ', description: '' }, i18next.t)).toEqual({ title: 'Название курса обязательно' });
    expect(validateLessonForm({ title: '---', description: '' }, i18next.t)).toEqual({ title: 'Введите название, используя буквы или цифры.' });
    expect(validateLessonForm({ title: 'Lesson 1', description: '' }, i18next.t)).toEqual({});
  });

  it('normalizes the course mutation', () => {
    expect(toCourseMutation({ title: ' Course ', description: ' ' })).toEqual({ title: 'Course', description: undefined });
  });
});
