import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest, uploadFileWithProgress } from '../shared/apiClient.js';
import { slugify } from '../shared/slugify.js';
import { sortLessons } from '../shared/sortLessons.js';
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

type MaterialStatus = 'active' | 'archived';
type MaterialKind = 'file' | 'link';

const MATERIAL_STATUSES: MaterialStatus[] = ['active', 'archived'];

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

function formatSize(sizeBytes: number | null, fallback: string) {
  if (sizeBytes === null) return fallback;
  if (sizeBytes >= 1_048_576) return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${(sizeBytes / 1024).toFixed(0)} KB`;
  return `${sizeBytes} B`;
}

export function AdminMaterialsPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');

  // Create form
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<MaterialKind>('link');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit dialog
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [editMaterial, setEditMaterial] = useState<Material | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editKind, setEditKind] = useState<MaterialKind>('link');
  const [editFileUrl, setEditFileUrl] = useState('');
  const [editFileName, setEditFileName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<MaterialStatus>('active');
  const [editUploadProgress, setEditUploadProgress] = useState<number | null>(null);
  const [editState, setEditState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  const loadMaterials = useCallback(async (courseId?: string) => {
    try {
      const courses = await apiRequest<Course[]>('/courses');
      const nextCourseId = courseId ?? (selectedCourseId || courses[0]?.id || '');
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
  }, [t, selectedCourseId]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  const selectedCourse = useMemo(() => {
    return loadState.status === 'loaded' ? loadState.courses.find((c) => c.id === selectedCourseId) : undefined;
  }, [loadState, selectedCourseId]);

  async function handleCourseChange(courseId: string) {
    setSelectedCourseId(courseId);
    setSelectedLessonId('');
    setSubmitState({ status: 'idle' });
    await loadMaterials(courseId);
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>, target: 'create' | 'edit') {
    const file = event.target.files?.[0];
    if (!file) return;

    const setProgress = target === 'create' ? setUploadProgress : setEditUploadProgress;
    const setUrl = target === 'create' ? setFileUrl : setEditFileUrl;
    const setName = target === 'create' ? setFileName : setEditFileName;
    const setError = target === 'create'
      ? (msg: string) => setSubmitState({ status: 'error', message: msg })
      : (msg: string) => setEditState({ status: 'error', message: msg });

    if (target === 'create') {
      setTitle((prev) => prev || file.name.replace(/\.[^.]+$/, ''));
      setKind('file');
    } else {
      setEditKind('file');
    }

    setProgress(0);
    try {
      const result = await uploadFileWithProgress(file, setProgress);
      setUrl(result.fileUrl);
      setName(result.fileName);
      if (target === 'create') {
        setMimeType(result.mimeType);
        setSizeBytes(result.sizeBytes);
      }
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 503
          ? t('admin.materials.uploadUnconfigured', 'File storage is not configured on this server.')
          : t('admin.materials.uploadError', 'Upload failed. Try again.');
      setError(message);
    } finally {
      setProgress(null);
      event.target.value = '';
    }
  }

  async function handleCreateMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || !selectedCourse) {
      return;
    }

    const materialTitle = title.trim();
    const slug = slugify(materialTitle);

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
          mimeType: mimeType || undefined,
          sizeBytes: sizeBytes ?? undefined,
          status: 'active',
        }),
      });

      setTitle('');
      setFileUrl('');
      setFileName('');
      setMimeType('');
      setSizeBytes(null);
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

  async function handleUpdateStatus(materialId: string, newStatus: string) {
    try {
      const updated = await apiRequest<Material>(`/materials/${encodeURIComponent(materialId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setLoadState((prev) =>
        prev.status === 'loaded'
          ? { ...prev, materials: prev.materials.map((m) => (m.id === materialId ? updated : m)) }
          : prev,
      );
    } catch {
      await loadMaterials(selectedCourseId);
    }
  }

  function openEditDialog(material: Material) {
    setEditMaterial(material);
    setEditTitle(material.title);
    setEditKind(material.kind);
    setEditFileUrl(material.fileUrl);
    setEditFileName(material.fileName ?? '');
    setEditDescription(material.description ?? '');
    setEditStatus(material.status as MaterialStatus);
    setEditUploadProgress(null);
    setEditState({ status: 'idle' });
    editDialogRef.current?.showModal();
  }

  async function handleUpdateMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editMaterial) {
      return;
    }

    const newTitle = editTitle.trim();
    const newFileUrl = editFileUrl.trim();

    if (!newTitle || !newFileUrl) {
      setEditState({
        status: 'error',
        message: t('admin.materials.invalidInput', 'Enter a material title and valid URL.'),
      });
      return;
    }

    setEditState({ status: 'saving' });

    try {
      const updated = await apiRequest<Material>(`/materials/${encodeURIComponent(editMaterial.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: newTitle,
          description: editDescription.trim() || null,
          kind: editKind,
          fileName: editFileName.trim() || null,
          fileUrl: newFileUrl,
          status: editStatus,
        }),
      });
      editDialogRef.current?.close();
      setLoadState((prev) =>
        prev.status === 'loaded'
          ? { ...prev, materials: prev.materials.map((m) => (m.id === editMaterial.id ? updated : m)) }
          : prev,
      );
    } catch {
      setEditState({
        status: 'error',
        message: t('admin.materials.editError', 'Unable to update material.'),
      });
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
            <p>{t('admin.materials.subtitle', 'Upload files or add URL links as course materials.')}</p>
          </div>
          <a href="/admin">{t('admin.materials.backToDashboard', 'Back to dashboard')}</a>
        </header>

        <section className="admin-content-grid">
          <article className="admin-card">
            <h2>{t('admin.materials.createTitle', 'Add material')}</h2>
            {loadState.courses.length === 0 ? (
              <EmptyState message={t('admin.materials.noCourses', 'Create a course before adding materials.')} />
            ) : (
              <form className="admin-form" onSubmit={handleCreateMaterial}>
                <div className="admin-form__field">
                  <label>{t('admin.materials.course', 'Course')}</label>
                  <select value={selectedCourseId} onChange={(event) => void handleCourseChange(event.target.value)}>
                    {loadState.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.materials.lesson', 'Lesson')}</label>
                  <select value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}>
                    <option value="">{t('admin.materials.noLesson', 'No lesson')}</option>
                    {loadState.lessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.order}. {lesson.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.materials.materialTitle', 'Title')}</label>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.materials.kind', 'Kind')}</label>
                  <select value={kind} onChange={(event) => setKind(event.target.value as MaterialKind)}>
                    <option value="link">{t('admin.materials.link', 'Link (URL)')}</option>
                    <option value="file">{t('admin.materials.file', 'File (upload)')}</option>
                  </select>
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.materials.fileUrl', 'URL')}</label>
                  <div className="admin-upload">
                    <div className="admin-upload__row">
                      <input
                        value={fileUrl}
                        onChange={(event) => setFileUrl(event.target.value)}
                        maxLength={2048}
                        placeholder="https://..."
                        disabled={uploadProgress !== null}
                      />
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        type="button"
                        disabled={uploadProgress !== null}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {t('admin.materials.uploadBtn', 'Upload file…')}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_FILE_TYPES}
                        hidden
                        onChange={(event) => void handleFileSelect(event, 'create')}
                      />
                    </div>
                    {uploadProgress !== null ? (
                      <div className="admin-upload__progress">
                        <div className="admin-upload__bar">
                          <div className="admin-upload__fill" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <span>{uploadProgress}%</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.materials.fileName', 'File name')}</label>
                  <input value={fileName} onChange={(event) => setFileName(event.target.value)} maxLength={255} />
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.materials.description', 'Description')}</label>
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
                </div>
                {submitState.status === 'error' ? (
                  <p className="admin-form__error" role="alert">
                    {submitState.message}
                  </p>
                ) : null}
                <div className="admin-form__actions">
                  <button
                    className="admin-btn admin-btn--primary"
                    type="submit"
                    disabled={submitState.status === 'saving' || uploadProgress !== null}
                  >
                    {submitState.status === 'saving'
                      ? t('admin.materials.saving', 'Saving...')
                      : t('admin.materials.create', 'Add material')}
                  </button>
                </div>
              </form>
            )}
          </article>

          <article className="admin-card">
            <h2>{t('admin.materials.materialsTitle', 'Materials')}</h2>
            {loadState.materials.length === 0 ? (
              <EmptyState message={t('admin.materials.empty', 'No materials found for the selected course.')} />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.materials.col.title', 'Title')}</th>
                    <th>{t('admin.materials.col.kind', 'Kind')}</th>
                    <th>{t('admin.materials.col.status', 'Status')}</th>
                    <th>{t('admin.materials.col.size', 'Size')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loadState.materials.map((material) => (
                    <tr key={material.id}>
                      <td>
                        <a href={material.fileUrl} target="_blank" rel="noreferrer">
                          {material.title}
                        </a>
                      </td>
                      <td>
                        <StatusBadge>{material.kind}</StatusBadge>
                      </td>
                      <td>
                        <select
                          className="admin-status-select"
                          value={material.status}
                          onChange={(event) => void handleUpdateStatus(material.id, event.target.value)}
                        >
                          {MATERIAL_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{formatSize(material.sizeBytes, t('admin.materials.unknownSize', '—'))}</td>
                      <td>
                        <button
                          className="admin-btn admin-btn--sm admin-btn--secondary"
                          type="button"
                          onClick={() => openEditDialog(material)}
                        >
                          {t('admin.materials.edit', 'Edit')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        </section>
      </section>

      <dialog ref={editDialogRef} className="admin-dialog">
        <header className="admin-dialog__header">
          <h2>{t('admin.materials.editTitle', 'Edit material')}</h2>
          <button
            className="admin-dialog__close"
            type="button"
            aria-label={t('admin.materials.close', 'Close')}
            onClick={() => editDialogRef.current?.close()}
          >
            ×
          </button>
        </header>
        <form className="admin-form" onSubmit={handleUpdateMaterial}>
          <div className="admin-form__field">
            <label>{t('admin.materials.materialTitle', 'Title')}</label>
            <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={160} />
          </div>
          <div className="admin-form__field">
            <label>{t('admin.materials.kind', 'Kind')}</label>
            <select value={editKind} onChange={(event) => setEditKind(event.target.value as MaterialKind)}>
              <option value="link">{t('admin.materials.link', 'Link (URL)')}</option>
              <option value="file">{t('admin.materials.file', 'File (upload)')}</option>
            </select>
          </div>
          <div className="admin-form__field">
            <label>{t('admin.materials.fileUrl', 'URL')}</label>
            <div className="admin-upload">
              <div className="admin-upload__row">
                <input
                  value={editFileUrl}
                  onChange={(event) => setEditFileUrl(event.target.value)}
                  maxLength={2048}
                  disabled={editUploadProgress !== null}
                />
                <button
                  className="admin-btn admin-btn--secondary admin-btn--sm"
                  type="button"
                  disabled={editUploadProgress !== null}
                  onClick={() => editFileInputRef.current?.click()}
                >
                  {t('admin.materials.replaceBtn', 'Replace file…')}
                </button>
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  hidden
                  onChange={(event) => void handleFileSelect(event, 'edit')}
                />
              </div>
              {editUploadProgress !== null ? (
                <div className="admin-upload__progress">
                  <div className="admin-upload__bar">
                    <div className="admin-upload__fill" style={{ width: `${editUploadProgress}%` }} />
                  </div>
                  <span>{editUploadProgress}%</span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="admin-form__field">
            <label>{t('admin.materials.fileName', 'File name')}</label>
            <input value={editFileName} onChange={(event) => setEditFileName(event.target.value)} maxLength={255} />
          </div>
          <div className="admin-form__field">
            <label>{t('admin.materials.col.status', 'Status')}</label>
            <select value={editStatus} onChange={(event) => setEditStatus(event.target.value as MaterialStatus)}>
              {MATERIAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-form__field">
            <label>{t('admin.materials.description', 'Description')}</label>
            <textarea
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              maxLength={1000}
            />
          </div>
          {editState.status === 'error' ? (
            <p className="admin-form__error" role="alert">
              {editState.message}
            </p>
          ) : null}
          <div className="admin-form__actions">
            <button
              className="admin-btn admin-btn--primary"
              type="submit"
              disabled={editState.status === 'saving' || editUploadProgress !== null}
            >
              {editState.status === 'saving'
                ? t('admin.materials.updating', 'Saving...')
                : t('admin.materials.update', 'Save changes')}
            </button>
            <button
              className="admin-btn admin-btn--secondary"
              type="button"
              onClick={() => editDialogRef.current?.close()}
            >
              {t('admin.materials.cancel', 'Cancel')}
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
