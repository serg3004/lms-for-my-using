import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  CourseMaterialSummary,
  LessonSummary,
  getLesson,
  listCourseMaterials,
} from '../shared/apiClient.js';
import { getCourseLessonsHref, getLessonHref } from '../shared/learnerRoutes.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';

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

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const coursesAction = <a href="/learn/courses">{t('courses.navLink')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <>
        <PageState message={t('materials.loading')} variant="loading" />
      </>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <>
        <PageState title={t('materials.title')} message={loadState.message} variant="error" action={loginAction} />
      </>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <>
        <PageState title={t('materials.title')} message={loadState.message} variant="error" action={coursesAction} />
      </>
    );
  }

  return (
    <>
      <nav>
        <a href={getLessonHref(loadState.lesson.id)}>{t('lessonDetail.title')}</a>
        <a href={getCourseLessonsHref(loadState.lesson.courseId)}>{t('lessons.navLink')}</a>
      </nav>

      <h1>{t('materials.title')}</h1>
      <p>{loadState.lesson.title}</p>

      {loadState.materials.length === 0 ? (
        <EmptyState message={t('materials.empty')} />
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
                  <dd>
                    <StatusBadge>{material.status}</StatusBadge>
                  </dd>
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
    </>
  );
}
