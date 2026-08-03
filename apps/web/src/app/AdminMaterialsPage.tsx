import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest, uploadFileWithProgress } from '../shared/apiClient.js';
import { slugify } from '../shared/slugify.js';
import { uploadReducer, type MaterialKind, type MaterialStatus } from './materials/model.js';
import { clearFieldError, hasValidationErrors, validateRequiredFields, type FormValidationErrors } from '../shared/formValidation.js';
import { sortLessons } from '../shared/sortLessons.js';
import { AdminStatusSelect } from '../shared/AdminStatusSelect.js';
import { MaterialTable } from './materials/MaterialTable.js';
import { MaterialMetadataForm } from './materials/MaterialMetadataForm.js';
import { useMaterialMutations } from './materials/useMaterialMutations.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { EmptyState, PageState, SearchInput, Toolbar } from '../shared/ui.js';
import type { PaginatedResponse } from '../shared/api/types.js';
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


export function AdminMaterialsPage() {
  const { t } = useTranslation();
  const materialMutations = useMaterialMutations();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialKindFilter, setMaterialKindFilter] = useState<'all' | 'file' | 'link'>('all');

  // Create form
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<MaterialKind>('link');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [uploadState, dispatchUpload] = useReducer(uploadReducer, { status: 'idle' });
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [createErrors, setCreateErrors] = useState<FormValidationErrors<'title' | 'fileUrl'>>({});
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
  const [editUploadState, dispatchEditUpload] = useReducer(uploadReducer, { status: 'idle' });
  const [editState, setEditState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [editErrors, setEditErrors] = useState<FormValidationErrors<'title' | 'fileUrl'>>({});

  const loadMaterials = useCallback(async (courseId?: string) => {
    try {
      const { items: courses } = await apiRequest<PaginatedResponse<Course>>('/courses?pageSize=200');
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

    const dispatch = target === 'create' ? dispatchUpload : dispatchEditUpload;
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

    dispatch({ type: 'start' });
    try {
      const result = await uploadFileWithProgress(file, (progress) => dispatch({ type: 'progress', progress }));
      dispatch({ type: 'success' });
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
      dispatch({ type: 'error', message });
      setError(message);
    } finally {
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

    const errors = validateRequiredFields([
      { name: 'title', value: materialTitle, message: t('admin.materials.titleRequired', 'Material title is required.') },
      { name: 'fileUrl', value: fileUrl, message: t('admin.materials.urlRequired', 'URL is required.') },
    ]);
    if (hasValidationErrors(errors)) { setCreateErrors(errors); return; }
    setCreateErrors({});

    setSubmitState({ status: 'saving' });

    try {
      await materialMutations.create(selectedCourse.id, {
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
      const updated = await materialMutations.updateStatus(materialId, newStatus);
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
    dispatchEditUpload({ type: 'reset' });
    setEditState({ status: 'idle' });
    setEditErrors({});
    editDialogRef.current?.showModal();
  }

  async function handleUpdateMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editMaterial) {
      return;
    }

    const newTitle = editTitle.trim();
    const newFileUrl = editFileUrl.trim();

    const editValidationErrors = validateRequiredFields([
      { name: 'title', value: newTitle, message: t('admin.materials.titleRequired', 'Material title is required.') },
      { name: 'fileUrl', value: newFileUrl, message: t('admin.materials.urlRequired', 'URL is required.') },
    ]);
    if (hasValidationErrors(editValidationErrors)) { setEditErrors(editValidationErrors); return; }
    setEditErrors({});

    setEditState({ status: 'saving' });

    try {
      const updated = await materialMutations.update(editMaterial.id, {
          title: newTitle,
          description: editDescription.trim() || null,
          kind: editKind,
          fileName: editFileName.trim() || null,
          fileUrl: newFileUrl,
          status: editStatus,
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

  const navItems: AdminNavItem[] = [
    { label: t('admin.courseBuilder.title', 'Course builder'), href: '/admin/courses' },
    { label: t('admin.lessons.title', 'Lesson editor'), href: '/admin/lessons' },
    { label: t('admin.materials.title', 'Materials'), href: '/admin/materials', isCurrent: true },
  ];

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.navLink', 'Admin')}
      navItems={navItems}
    >
      <AdminPageHeader
        title={t('admin.materials.title', 'Materials')}
        subtitle={t('admin.materials.subtitle', 'Upload files or add URL links as course materials.')}
        action={<a href="/admin">{t('admin.materials.backToDashboard', 'Back to dashboard')}</a>}
      />

      <section className="admin-content-grid">
        <AdminCard>
            <h2>{t('admin.materials.createTitle', 'Add material')}</h2>
            {loadState.courses.length === 0 ? (
              <EmptyState message={t('admin.materials.noCourses', 'Create a course before adding materials.')} />
            ) : (
              <form className="admin-form" onSubmit={handleCreateMaterial}>
                <FormField id="material-create-course" label={t('admin.materials.course', 'Course')}>
                  <select id="material-create-course" value={selectedCourseId} onChange={(event) => void handleCourseChange(event.target.value)}>
                    {loadState.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField id="material-create-lesson" label={t('admin.materials.lesson', 'Lesson')}>
                  <select id="material-create-lesson" value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}>
                    <option value="">{t('admin.materials.noLesson', 'No lesson')}</option>
                    {loadState.lessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.order}. {lesson.title}
                      </option>
                    ))}
                  </select>
                </FormField>
                <MaterialMetadataForm
                  form={{ title, kind }}
                  t={t}
                  titleError={createErrors.title}
                  onChange={(field, value) => {
                    if (field === 'title') { setTitle(value); setCreateErrors((prev) => clearFieldError(prev, 'title')); }
                    else if (field === 'kind') setKind(value as MaterialKind);
                  }}
                />
                <FormField id="material-create-fileurl" label={t('admin.materials.fileUrl', 'URL')} required error={createErrors.fileUrl}>
                  <div className="admin-upload">
                    <div className="admin-upload__row">
                      <input
                        id="material-create-fileurl"
                        aria-describedby={createErrors.fileUrl ? 'material-create-fileurl-error' : undefined}
                        aria-invalid={Boolean(createErrors.fileUrl)}
                        value={fileUrl}
                        onChange={(event) => { setFileUrl(event.target.value); setCreateErrors((prev) => clearFieldError(prev, 'fileUrl')); }}
                        maxLength={2048}
                        placeholder="https://..."
                        disabled={uploadState.status === 'uploading'}
                      />
                      <button
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        type="button"
                        disabled={uploadState.status === 'uploading'}
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
                    {uploadState.status === 'uploading' ? (
                      <div className="admin-upload__progress">
                        <div className="admin-upload__bar">
                          <div className="admin-upload__fill" style={{ width: `${uploadState.progress}%` }} />
                        </div>
                        <span>{uploadState.progress}%</span>
                      </div>
                    ) : null}
                  </div>
                </FormField>

                <FormField id="material-create-filename" label={t('admin.materials.fileName', 'File name')}>
                  <input id="material-create-filename" value={fileName} onChange={(event) => setFileName(event.target.value)} maxLength={255} />
                </FormField>
                <FormField id="material-create-description" label={t('admin.materials.description', 'Description')}>
                  <textarea id="material-create-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
                </FormField>
                {submitState.status === 'error' ? (
                  <p className="admin-form__error" role="alert">
                    {submitState.message}
                  </p>
                ) : null}
                <div className="admin-form__actions">
                  <button
                    className="admin-btn admin-btn--primary"
                    type="submit"
                    disabled={submitState.status === 'saving' || uploadState.status === 'uploading'}
                  >
                    {submitState.status === 'saving'
                      ? t('admin.materials.saving', 'Saving...')
                      : t('admin.materials.create', 'Add material')}
                  </button>
                </div>
              </form>
            )}
        </AdminCard>

        <AdminCard>
            <h2>{t('admin.materials.materialsTitle', 'Materials')}</h2>
            <Toolbar
              left={
                <SearchInput
                  value={materialSearch}
                  onChange={setMaterialSearch}
                  placeholder={t('admin.materials.searchPlaceholder', 'Search materials...')}
                />
              }
              right={
                <select
                  className="admin-status-select"
                  value={materialKindFilter}
                  onChange={(e) => setMaterialKindFilter(e.target.value as 'all' | 'file' | 'link')}
                >
                  <option value="all">{t('admin.materials.filterAllTypes', 'All types')}</option>
                  <option value="file">{t('admin.materials.file', 'File (upload)')}</option>
                  <option value="link">{t('admin.materials.link', 'External link')}</option>
                </select>
              }
            />
            <MaterialTable
              materials={loadState.materials.filter((material) => {
                const matchesSearch =
                  !materialSearch.trim() || material.title.toLowerCase().includes(materialSearch.trim().toLowerCase());
                const matchesKind = materialKindFilter === 'all' || material.kind === materialKindFilter;
                return matchesSearch && matchesKind;
              })}
              t={t}
              onEdit={(materialId) => {
                const material = loadState.materials.find((item) => item.id === materialId);
                if (material) openEditDialog(material);
              }}
              onStatusChange={(materialId, status) => void handleUpdateStatus(materialId, status)}
            />
        </AdminCard>
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
          <FormField id="material-edit-title" label={t('admin.materials.materialTitle', 'Title')} required error={editErrors.title}>
            <input id="material-edit-title" aria-describedby={editErrors.title ? 'material-edit-title-error' : undefined} aria-invalid={Boolean(editErrors.title)} value={editTitle} onChange={(event) => { setEditTitle(event.target.value); setEditErrors((prev) => clearFieldError(prev, 'title')); }} maxLength={160} />
          </FormField>
          <FormField id="material-edit-kind" label={t('admin.materials.kind', 'Kind')}>
            <select id="material-edit-kind" value={editKind} onChange={(event) => setEditKind(event.target.value as MaterialKind)}>
              <option value="link">{t('admin.materials.link', 'Link (URL)')}</option>
              <option value="file">{t('admin.materials.file', 'File (upload)')}</option>
            </select>
          </FormField>
          <FormField id="material-edit-fileurl" label={t('admin.materials.fileUrl', 'URL')} required error={editErrors.fileUrl}>
            <div className="admin-upload">
              <div className="admin-upload__row">
                <input
                  id="material-edit-fileurl"
                  aria-describedby={editErrors.fileUrl ? 'material-edit-fileurl-error' : undefined}
                  aria-invalid={Boolean(editErrors.fileUrl)}
                  value={editFileUrl}
                  onChange={(event) => { setEditFileUrl(event.target.value); setEditErrors((prev) => clearFieldError(prev, 'fileUrl')); }}
                  maxLength={2048}
                  disabled={editUploadState.status === 'uploading'}
                />
                <button
                  className="admin-btn admin-btn--secondary admin-btn--sm"
                  type="button"
                  disabled={editUploadState.status === 'uploading'}
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
              {editUploadState.status === 'uploading' ? (
                <div className="admin-upload__progress">
                  <div className="admin-upload__bar">
                    <div className="admin-upload__fill" style={{ width: `${editUploadState.progress}%` }} />
                  </div>
                  <span>{editUploadState.progress}%</span>
                </div>
              ) : null}
            </div>
          </FormField>
          <FormField id="material-edit-filename" label={t('admin.materials.fileName', 'File name')}>
            <input id="material-edit-filename" value={editFileName} onChange={(event) => setEditFileName(event.target.value)} maxLength={255} />
          </FormField>
          <FormField id="material-edit-status" label={t('admin.materials.col.status', 'Status')}>
            <AdminStatusSelect value={editStatus} statuses={MATERIAL_STATUSES} onChange={(status) => setEditStatus(status)} className="admin-form-status-select" />
          </FormField>
          <FormField id="material-edit-description" label={t('admin.materials.description', 'Description')}>
            <textarea id="material-edit-description" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={1000} />
          </FormField>
          {editState.status === 'error' ? (
            <p className="admin-form__error" role="alert">
              {editState.message}
            </p>
          ) : null}
          <div className="admin-form__actions">
            <button
              className="admin-btn admin-btn--primary"
              type="submit"
              disabled={editState.status === 'saving' || editUploadState.status === 'uploading'}
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
    </AdminPageLayout>
  );
}
