import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  CourseMaterialSummary,
  LessonSummary,
  getLesson,
  listCourseMaterials,
} from '../shared/apiClient.js';

type LessonMaterialsLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; lesson: LessonSummary; materials: CourseMaterialSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function formatDescription(material: CourseMaterialSummary) {
  return material.description?.trim() || material.slug;
}

function getLessonHref(lessonId: string) {
  return `/learn/lessons/${encodeURIComponent(lessonId)}`;
}

function getCourseLessonsHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}/lessons`;
}

function getMaterialLabel(material: CourseMaterialSummary) {
  return material.fileName ?? material.kind;
}

export function LearnerLessonMaterialsPage({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LessonMaterialsLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadLessonMaterials() {
      setLoadState({ status: 'loading' });

      try {
        const lesson = await getLesson(lessonId);
        const courseMaterials = await listCourseMaterials(lesson.courseId);
        const lessonMaterials = courseMaterials.filter((material) => material.lessonId === lesson.id);

        if (isMounted) {
          setLoadState({ status: 'loaded', lesson, materials: lessonMaterials });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('materials.sessionExpired'),
          });
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState({
            status: 'notFound',
            message: t('materials.notFound'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('materials.loadError'),
        });
      }
    }

    void loadLessonMaterials();

    return () => {
      isMounted = false;
    };
  }, [lessonId, t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('materials.loading')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('materials.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <h1>{t('materials.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/learn/courses">{t('courses.navLink')}</a>
      </main>
    );
  }

  return (
    <main>
      <nav>
        <a href={getLessonHref(loadState.lesson.id)}>{t('lessonDetail.title')}</a>
        <a href={getCourseLessonsHref(loadState.lesson.courseId)}>{t('lessons.navLink')}</a>
      </nav>

      <h1>{t('materials.title')}</h1>
      <p>{loadState.lesson.title}</p>

      {loadState.materials.length === 0 ? (
        <p>{t('materials.empty')}</p>
      ) : (
        <ul>
          {loadState.materials.map((material) => (
            <li key={material.id}>
              <article>
                <h2>{material.title}</h2>
                <p>{formatDescription(material)}</p>
                <dl>
                  <dt>{t('materials.kind')}</dt>
                  <dd>{material.kind}</dd>
                  <dt>{t('materials.status')}</dt>
                  <dd>{material.status}</dd>
                  <dt>{t('materials.file')}</dt>
                  <dd>
                    {material.fileUrl ? (
                      <a href={material.fileUrl}>{getMaterialLabel(material)}</a>
                    ) : (
                      getMaterialLabel(material)
                    )}
                  </dd>
                  <dt>{t('materials.mimeType')}</dt>
                  <dd>{material.mimeType ?? t('materials.notAvailable')}</dd>
                  <dt>{t('materials.sizeBytes')}</dt>
                  <dd>{material.sizeBytes ?? t('materials.notAvailable')}</dd>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
