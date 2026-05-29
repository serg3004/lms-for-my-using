import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

type Course = { id: string; organizationId: string; title: string; status: string };
type Lesson = { id: string; title: string; order: number };
type Material = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  kind: 'file' | 'link';
  fileName: string | null;
  fileUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  status: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; courses: Course[]; lessons: Lesson[]; materials: Material[] }
  | { status: 'error'; message: string };

function slugifyMaterialTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function sortLessons(lessons: Lesson[]) {
  return [...lessons].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
}

function formatSize(sizeBytes: number | null, fallback: string) {
  if (sizeBytes === null) {
    return fallback;
  }

  return `${sizeBytes} B`;
}

export function AdminMaterialsPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'file' | 'link'>('link');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [description, setDescription] = useState('');
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  async function loadMaterials(courseId?: string) {
    if (!getAuthToken()) {
      setLoadState({
        status: 'error',
        message: t('admin.materials.authRequired', 'Sign in to manage materials.'),
      });
      return;
    }

    try {
      const courses = await apiRequest<Course[]>('/courses');
      const nextCourseId = courseId || selectedCourseId || courses[0]?.id || '';
      const [lessons, materials] = nextCourseId
        ? await Promise.all([
            apiRequest<Lesson[]>(`/courses/${encodeURIComponent(nextCourseId)}/lessons`),
            apiRequest<Material[]>(`/courses/${encodeURIComponent(nextCourseId)}/materials`),
          ])
        : [[], []];

      setSelectedCourseId(nextCourseId);
      setLoadState({ status: 'loaded', courses, lessons: sortLessons(lessons), materials });
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 401
          ? t('admin.materials.sessionExpired', 'Your session expired. Sign in again.')
          : t('admin.materials.loadError', 'Unable to load materials.');
      setLoadState({ status: 'error', message });
    }
  }

  useEffect(() => {
    void loadMaterials();
  }, [t]);

  const selectedCourse = useMemo(() => {
    return loadState.status === 'loaded' ? loadState.courses.find((course) => course.id === selectedCourseId) : undefined;
  }, [loadState, selectedCourseId]);

  async function handleCourseChange(courseId: string) {
    setSelectedCourseId(courseId);
    setSelectedLessonId('');
    setSubmitState({ status: 'idle' });
    await loadMaterials(courseId);
  }

  async function handleCreateMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || !selectedCourse) {
      return;
    }

    const materialTitle = title.trim();
    const slug = slugifyMaterialTitle(materialTitle);

    if (!materialTitle || !slug || !fileUrl.trim()) {
      setSubmitState({
        status: 'error',
        message: t('admin.materials.invalidInput', 'Enter a material title and valid URL.'),
      });
      return;
    }

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<Material>(`/courses/${encodeURIComponent(selectedCourse.id)}/materials`, {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedCourse.organizationId,
          courseId: selectedCourse.id,
          lessonId: selectedLessonId || undefined,
          title: materialTitle,
          slug,
          description: description.trim() || undefined,
          kind,
          fileName: fileName.trim() || undefined,
          fileUrl: fileUrl.trim(),
          status: 'active',
        }),
      });

      setTitle('');
      setFileUrl('');
      setFileName('');
      setDescription('');
      setSubmitState({ status: 'idle' });
      await loadMaterials(selectedCourse.id);
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 409
          ? t('admin.materials.materialExists', 'A material with this slug already exists in the selected course.')
          : t('admin.materials.saveError', 'Unable to create material.');
      setSubmitState({ status: 'error', message });
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.materials.loading', 'Loading materials...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.materials.title', 'Materials')} message={loadState.message} variant="error" />
      </main>
    );
  }

  return (
    <main className="admin-layout">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/admin">
          {t('admin.navLink', 'Admin')}
        </a>
        <nav className="admin-nav">
          <a className="admin-nav-link" href="/admin/courses">
            {t('admin.courseBuilder.title', 'Course builder')}
          </a>
          <a className="admin-nav-link" href="/admin/lessons">
            {t('admin.lessons.title', 'Lesson editor')}
          </a>
          <a className="admin-nav-link" href="/admin/materials" aria-current="page">
            {t('admin.materials.title', 'Materials')}
          </a>
        </nav>
      </aside>

      <section className="admin-shell">
        <header className="admin-topbar">
          <div>
            <h1>{t('admin.materials.title', 'Materials')}</h1>
            <p>{t('admin.materials.subtitle', 'Add URL-based course materials and review active materials.')}</p>
          </div>
          <a href="/admin">{t('admin.materials.backToDashboard', 'Back to dashboard')}</a>
        </header>

        <section className="admin-content-grid">
          <article className="admin-card">
            <h2>{t('admin.materials.createTitle', 'Add material')}</h2>
            {loadState.courses.length === 0 ? (
              <EmptyState message={t('admin.materials.noCourses', 'Create a course before adding materials.')} />
            ) : (
              <form onSubmit={handleCreateMaterial}>
                <label>
                  {t('admin.materials.course', 'Course')}
                  <select value={selectedCourseId} onChange={(event) => void handleCourseChange(event.target.value)}>
                    {loadState.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('admin.materials.lesson', 'Lesson')}
                  <select value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}>
                    <option value="">{t('admin.materials.noLesson', 'No lesson')}</option>
                    {loadState.lessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.order}. {lesson.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('admin.materials.materialTitle', 'Material title')}
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
                </label>
                <label>
                  {t('admin.materials.kind', 'Kind')}
                  <select value={kind} onChange={(event) => setKind(event.target.value as 'file' | 'link')}>
                    <option value="link">{t('admin.materials.link', 'Link')}</option>
                    <option value="file">{t('admin.materials.file', 'File')}</option>
                  </select>
                </label>
                <label>
                  {t('admin.materials.fileUrl', 'Material URL')}
                  <input value={fileUrl} onChange={(event) => setFileUrl(event.target.value)} maxLength={2048} />
                </label>
                <label>
                  {t('admin.materials.fileName', 'File name')}
                  <input value={fileName} onChange={(event) => setFileName(event.target.value)} maxLength={255} />
                </label>
                <label>
                  {t('admin.materials.description', 'Description')}
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
                </label>
                {submitState.status === 'error' ? <p role="alert">{submitState.message}</p> : null}
                <button type="submit" disabled={submitState.status === 'saving'}>
                  {submitState.status === 'saving'
                    ? t('admin.materials.saving', 'Saving...')
                    : t('admin.materials.create', 'Add material')}
                </button>
              </form>
            )}
          </article>

          <article className="admin-card">
            <h2>{t('admin.materials.materialsTitle', 'Active materials')}</h2>
            {loadState.materials.length === 0 ? (
              <EmptyState message={t('admin.materials.empty', 'No materials found for the selected course.')} />
            ) : (
              <table>
                <tbody>
                  {loadState.materials.map((material) => (
                    <tr key={material.id}>
                      <td>
                        <a href={material.fileUrl}>{material.title}</a>
                      </td>
                      <td>{material.slug}</td>
                      <td>
                        <StatusBadge>{material.kind}</StatusBadge>
                      </td>
                      <td>{formatSize(material.sizeBytes, t('admin.materials.unknownSize', 'Unknown'))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>

          <article className="admin-card">
            <h2>{t('admin.materials.lifecycleTitle', 'Delete and restore')}</h2>
            <p>
              {t(
                'admin.materials.lifecycleUnavailable',
                'Delete and restore actions require backend endpoints; this screen only uses the existing list/create material API.',
              )}
            </p>
          </article>
        </section>
      </section>
    </main>
  );
}
