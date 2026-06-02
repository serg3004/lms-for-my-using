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
