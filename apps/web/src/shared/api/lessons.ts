import { apiRequest } from '../apiClient.js';

import type { CreateLessonCompletionInput, LessonSummary, ProgressSummary } from './types.js';

export function getCourseLessonsPath(courseId: string) {
  return `/courses/${encodeURIComponent(courseId)}/lessons`;
}

export function getLessonPath(lessonId: string) {
  return `/lessons/${encodeURIComponent(lessonId)}`;
}

export function listLessons(courseId: string) {
  return apiRequest<LessonSummary[]>(getCourseLessonsPath(courseId));
}

export function getLesson(lessonId: string) {
  return apiRequest<LessonSummary>(getLessonPath(lessonId));
}

export type CreateLessonInput = {
  organizationId: string;
  title: string;
  slug: string;
  description?: string;
  order?: number;
  status?: string;
};

export type UpdateLessonInput = {
  title?: string;
  description?: string | null;
  order?: number;
  status?: string;
};

export function createLesson(courseId: string, input: CreateLessonInput) {
  return apiRequest<LessonSummary>(getCourseLessonsPath(courseId), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLesson(lessonId: string, input: UpdateLessonInput) {
  return apiRequest<LessonSummary>(getLessonPath(lessonId), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function markLessonCompleted(input: CreateLessonCompletionInput) {
  return apiRequest<ProgressSummary>('/progress', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      status: 'completed',
      completedAt: new Date().toISOString(),
    }),
  });
}
