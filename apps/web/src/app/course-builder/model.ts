import { slugify } from '../../shared/slugify.js';

export type CourseForm = { title: string; description: string };
export type LessonForm = { title: string; description: string };

export function validateCourseForm(form: CourseForm): { title?: string } {
  return form.title.trim() ? {} : { title: 'Course title is required' };
}

export function validateLessonForm(form: LessonForm): { title?: string } {
  const title = form.title.trim();
  if (!title) return { title: 'Lesson title is required' };
  if (!slugify(title)) return { title: 'Enter a title using letters or numbers.' };
  return {};
}

export function toCourseMutation(form: CourseForm) {
  return { title: form.title.trim(), description: form.description.trim() || undefined };
}

