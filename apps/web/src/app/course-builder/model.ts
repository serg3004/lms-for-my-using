import type { TFunction } from 'i18next';

export type CourseForm = { title: string; description: string };
export type LessonForm = { title: string; description: string };

export function validateCourseForm(form: CourseForm, t: TFunction): { title?: string } {
  return form.title.trim()
    ? {}
    : { title: t('admin.courses.titleRequired', 'Course title is required') };
}

export function validateLessonForm(form: LessonForm, t: TFunction): { title?: string } {
  const title = form.title.trim();
  if (!title) return { title: t('admin.courseBuilder.lessonTitleRequired', 'Lesson title is required') };
  if (!/[\p{L}\p{N}]/u.test(title)) return { title: t('admin.courses.invalidTitle', 'Enter a title using letters or numbers.') };
  return {};
}

export function toCourseMutation(form: CourseForm) {
  return { title: form.title.trim(), description: form.description.trim() || undefined };
}

