import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { apiRequest } from '../../shared/apiClient.js';
import type { PaginatedResponse } from '../../shared/api/types.js';
import { sortLessons } from '../../shared/sortLessons.js';
import { getAssessmentBuilderLoadErrorKey, type Course, type Lesson } from './model.js';

type LoadState = { status: 'loading' } | { status: 'loaded'; courses: Course[]; lessons: Lesson[] } | { status: 'error'; message: string };

export function useAssessmentBuilder(t: TFunction) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<PaginatedResponse<Course>>('/courses?pageSize=200', { signal: controller.signal })
      .then(({ items: courses }) => {
        if (controller.signal.aborted) return;
        setSelectedCourseId(courses[0]?.id ?? '');
        setLoadState({ status: 'loaded', courses, lessons: [] });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadState({ status: 'error', message: t(getAssessmentBuilderLoadErrorKey(error)) });
      });
    return () => controller.abort();
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    if (selectedCourseId) {
      void apiRequest<Lesson[]>(`/courses/${encodeURIComponent(selectedCourseId)}/lessons`, { signal: controller.signal })
        .then((lessons) => {
          if (controller.signal.aborted) return;
          setLoadState((previous) => previous.status === 'loaded' ? { ...previous, lessons: sortLessons(lessons) } : previous);
        })
        .catch(() => { /* The course can still be selected without a lesson. */ });
    }
    return () => controller.abort();
  }, [selectedCourseId]);

  function selectCourse(courseId: string) {
    if (courseId === selectedCourseId) return;
    setSelectedCourseId(courseId);
    setSelectedLessonId('');
    setLoadState((previous) => previous.status === 'loaded' ? { ...previous, lessons: [] } : previous);
  }

  return { loadState, selectedCourseId, selectedLessonId, setSelectedLessonId, selectCourse };
}
