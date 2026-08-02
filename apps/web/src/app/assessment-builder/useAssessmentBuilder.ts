import { useCallback, useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { ApiClientError, apiRequest } from '../../shared/apiClient.js';
import type { PaginatedResponse } from '../../shared/api/types.js';
import { sortLessons } from '../../shared/sortLessons.js';
import type { Assessment, Course, Lesson } from './model.js';

type LoadState = { status: 'loading' } | { status: 'loaded'; courses: Course[]; lessons: Lesson[]; assessments: Assessment[] } | { status: 'error'; message: string };

export function useAssessmentBuilder(t: TFunction) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');

  const load = useCallback(async (courseId?: string) => {
    try {
      const [{ items: courses }, assessments] = await Promise.all([apiRequest<PaginatedResponse<Course>>('/courses?pageSize=200'), apiRequest<Assessment[]>('/assessments')]);
      const nextCourseId = courseId ?? (selectedCourseId || courses[0]?.id || '');
      const lessons = nextCourseId ? await apiRequest<Lesson[]>(`/courses/${encodeURIComponent(nextCourseId)}/lessons`) : [];
      setSelectedCourseId(nextCourseId);
      setLoadState({ status: 'loaded', courses, lessons: sortLessons(lessons), assessments });
    } catch (error) {
      setLoadState({ status: 'error', message: error instanceof ApiClientError && error.status === 401 ? t('admin.assessmentBuilder.sessionExpired', 'Your session expired. Sign in again.') : t('admin.assessmentBuilder.loadError', 'Unable to load assessment builder.') });
    }
  }, [selectedCourseId, t]);

  useEffect(() => { void load(); }, [load]);
  const replaceAssessment = useCallback((updated: Assessment) => setLoadState((previous) => previous.status === 'loaded' ? { ...previous, assessments: previous.assessments.map((item) => item.id === updated.id ? updated : item) } : previous), []);
  const selectCourse = useCallback(async (courseId: string) => { setSelectedCourseId(courseId); setSelectedLessonId(''); await load(courseId); }, [load]);
  return { loadState, selectedCourseId, selectedLessonId, setSelectedLessonId, selectCourse, load, replaceAssessment };
}
