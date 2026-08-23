import { type ChangeEvent, type DragEvent, type FormEvent, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest, uploadMaterialFileWithProgress } from '../shared/apiClient.js';
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
import { ACCEPTED_MATERIAL_FILE_TYPES, validateMaterialFile } from './materials/fileValidation.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type Course = { id: string; organizationId: string; title: string; status: string };
type Lesson = { id: string; title: string; order: number };
type Material = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  kind: 'file' | 'link';
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: string;
};

type AdminMaterialsData = { courses: Course[]; lessons: Lesson[]; materials: Material[] };

const MATERIAL_STATUSES: MaterialStatus[] = ['active', 'archived'];

const ACCEPTED_FILE_TYPES = ACCEPTED_MATERIAL_FILE_TYPES.join(',');


export function AdminMaterialsPage() {
  const { t } = useTranslation();
  const statusLabels: Record<MaterialStatus, string> = {
    active: t('admin.materials.status.active', 'Active'),
    archived: t('admin.materials.status.archived', 'Archived'),
  };
  const materialMutations = useMaterialMutations();
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingMaterialId, setPendingMaterialId] = useState<string | null>(null);
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
  const [editSelectedFile, setEditSelectedFile] = useState<File | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<MaterialStatus>('active');
  const [editUploadState, dispatchEditUpload] = useReducer(uploadReducer, { status: 'idle' });
  const [editState, setEditState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [editErrors, setEditErrors] = useState<FormValidationErrors<'title' | 'fileUrl'>>({});

  const pendingCourseIdRef = useRef<string | undefined>(undefined);

  const { state: loadState, reload: loadMaterials, mutate } = useAsyncData<AdminMaterialsData>(
    async () => {
      const { items: courses } = await apiRequest<PaginatedResponse<Course>>('/courses?pageSize=200');
      const nextCourseId = pendingCourseIdRef.current ?? (selectedCourseId || courses[0]?.id || '');
      pendingCourseIdRef.current = undefined;
      const [lessons, materials] = nextCourseId
        ? await Promise.all([
            apiRequest<Lesson[]>(`/courses/${encodeURIComponent(nextCourseId)}/lessons`),
            apiRequest<Material[]>(`/courses/${encodeURIComponent(nextCourseId)}/materials`),
          ])
        : [[], []];

      setSelectedCourseId(nextCourseId);
      return { courses, lessons: sortLessons(lessons), materials };
    },
    [t],
    {
      unauthenticated: t('admin.materials.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.materials.loadError', 'Unable to load materials.'),
    },
  );

  const selectedCourse = useMemo(() => {
    return loadState.status === 'loaded' ? loadState.data.courses.find((c) => c.id === selectedCourseId) : undefined;
  }, [loadState, selectedCourseId]);

  async function handleCourseChange(courseId: string) {
    pendingCourseIdRef.current = courseId;
    setSelectedCourseId(courseId);
    setSelectedLessonId('');
    setSubmitState({ status: 'idle' });
    await loadMaterials();
  }

  function selectFile(file: File, target: 'create' | 'edit') {
    const validationError = validateMaterialFile(file);
    if (validationError) {
      const message = validationError === 'unsupported-type'
        ? t('admin.materials.unsupportedFile', 'Unsupported file type. Choose PDF, MP4, MP3, DOCX, or XLSX.')
        : validationError === 'empty'
          ? t('admin.materials.emptyFile', 'The selected file is empty.')
          : t('admin.materials.fileTooLarge', 'The selected file exceeds the 50 MB limit.');
      if (target === 'create') {
        setCreateErrors((previous) => ({ ...previous, fileUrl: message }));
        setSubmitState({ status: 'error', message });
      } else {
        setEditErrors((previous) => ({ ...previous, fileUrl: message }));
        setEditState({ status: 'error', message });
      }
      return;
    }

    if (target === 'create') {
      setTitle((prev) => prev || file.name.replace(/\.[^.]+$/, ''));
      setKind('file');
      setSelectedFile(file);
      setFileName(file.name);
      setMimeType(file.type);
      setSizeBytes(file.size);
      setFileUrl('');
      setPendingMaterialId(null);
      setCreateErrors((previous) => clearFieldError(previous, 'fileUrl'));
      dispatchUpload({ type: 'reset' });
      setSubmitState({ status: 'idle' });
    } else {
      setEditKind('file');
      setEditSelectedFile(file);
      setEditFileName(file.name);
      setEditFileUrl('');
      setEditErrors((previous) => clearFieldError(previous, 'fileUrl'));
      dispatchEditUpload({ type: 'reset' });
      setEditState({ status: 'idle' });
    }
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>, target: 'create' | 'edit') {
    const file = event.target.files?.[0];
    if (file) selectFile(file, target);
    event.target.value = '';
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>, target: 'create' | 'edit') {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) selectFile(file, target);
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
      ...(kind === 'link'
        ? [{ name: 'fileUrl' as const, value: fileUrl, message: t('admin.materials.urlRequired', 'URL is required.') }]
        : [{ name: 'fileUrl' as const, value: selectedFile ? 'selected' : '', message: t('admin.materials.fileRequired', 'Select a file to upload.') }]),
    ]);
    if (hasValidationErrors(errors)) { setCreateErrors(errors); return; }
    setCreateErrors({});

    setSubmitState({ status: 'saving' });
    let uploadAttempted = false;

    try {
      const material = pendingMaterialId
        ? { id: pendingMaterialId }
        : await materialMutations.create(selectedCourse.id, {
          organizationId: selectedCourse.organizationId,
          courseId: selectedCourse.id,
          lessonId: selectedLessonId || undefined,
          title: materialTitle,
          slug,
          description: description.trim() || undefined,
          kind,
          fileName: fileName.trim() || undefined,
          fileUrl: kind === 'link' ? fileUrl.trim() : undefined,
          mimeType: kind === 'link' ? mimeType || undefined : undefined,
          sizeBytes: kind === 'link' ? sizeBytes ?? undefined : undefined,
          status: 'active',
        });

      if (kind === 'file' && selectedFile) {
        setPendingMaterialId(material.id);
        uploadAttempted = true;
        dispatchUpload({ type: 'start' });
        await uploadMaterialFileWithProgress(material.id, selectedFile, (progress) =>
          dispatchUpload({ type: 'progress', progress }),
        );
        dispatchUpload({ type: 'success' });
        uploadAttempted = false;
      }

      setTitle('');
      setFileUrl('');
      setFileName('');
      setMimeType('');
      setSizeBytes(null);
      setSelectedFile(null);
      setPendingMaterialId(null);
      setDescription('');
      setSubmitState({ status: 'idle' });
      await loadMaterials();
    } catch (error) {
      if (uploadAttempted) {
        const message = error instanceof ApiClientError && error.status === 503
          ? t('admin.materials.uploadUnconfigured', 'File storage is not configured on this server.')
          : t('admin.materials.uploadError', 'Material was created, but the upload failed. Try again.');
        dispatchUpload({ type: 'error', message });
        setSubmitState({ status: 'error', message });
        return;
      }
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
      mutate((data) => ({ ...data, materials: data.materials.map((m) => (m.id === materialId ? updated : m)) }));
    } catch {
      await loadMaterials();
    }
  }

  function openEditDialog(material: Material) {
    setEditMaterial(material);
    setEditTitle(material.title);
    setEditKind(material.kind);
    setEditFileUrl(material.fileUrl ?? '');
    setEditFileName(material.fileName ?? '');
    setEditSelectedFile(null);
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
      ...(editKind === 'link'
        ? [{ name: 'fileUrl' as const, value: newFileUrl, message: t('admin.materials.urlRequired', 'URL is required.') }]
        : []),
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
          fileUrl: editKind === 'link' ? newFileUrl : null,
          status: editStatus,
      });
      if (editSelectedFile) {
        dispatchEditUpload({ type: 'start' });
        await uploadMaterialFileWithProgress(editMaterial.id, editSelectedFile, (progress) =>
          dispatchEditUpload({ type: 'progress', progress }),
        );
        dispatchEditUpload({ type: 'success' });
      }
      editDialogRef.current?.close();
      mutate((data) => ({ ...data, materials: data.materials.map((m) => (m.id === editMaterial.id ? updated : m)) }));
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

  if (loadState.status === 'unauthenticated' || loadState.status === 'notFound' || loadState.status === 'error') {
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
        eyebrow={t('admin.materials.eyebrow', 'Files and resources')}
        title={t('admin.materials.title', 'Materials')}
        subtitle={t('admin.materials.subtitle', 'Upload files or add URL links as course materials.')}
        action={<a href="/admin">{t('admin.materials.backToDashboard', 'Back to dashboard')}</a>}
      />

      <section className="admin-content-grid">
        <AdminCard>
            <h2>{t('admin.materials.createTitle', 'Add material')}</h2>
            {loadState.data.courses.length === 0 ? (
              <EmptyState message={t('admin.materials.noCourses', 'Create a course before adding materials.')} />
            ) : (
              <form className="admin-form" onSubmit={handleCreateMaterial}>
                <FormField id="material-create-course" label={t('admin.materials.course', 'Course')}>
                  <select id="material-create-course" value={selectedCourseId} onChange={(event) => void handleCourseChange(event.target.value)}>
                    {loadState.data.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField id="material-create-lesson" label={t('admin.materials.lesson', 'Lesson')}>
                  <select id="material-create-lesson" value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}>
                    <option value="">{t('admin.materials.noLesson', 'No lesson')}</option>
                    {loadState.data.lessons.map((lesson) => (
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
                    else if (field === 'kind') {
                      setKind(value as MaterialKind);
                      setPendingMaterialId(null);
                      setCreateErrors((prev) => clearFieldError(prev, 'fileUrl'));
                    }
                  }}
                />
                <FormField
                  id="material-create-fileurl"
                  label={kind === 'link' ? t('admin.materials.fileUrl', 'URL') : t('admin.materials.file', 'File')}
                  required
                  error={createErrors.fileUrl}
                >
                  <div
                    className={`admin-upload${kind === 'file' ? ' admin-upload--dropzone' : ''}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleFileDrop(event, 'create')}
                    >
                    <div className="admin-upload__row">
                      {kind === 'link' ? (
                        <input
                          id="material-create-fileurl"
                          aria-describedby={createErrors.fileUrl ? 'material-create-fileurl-error' : undefined}
                          aria-invalid={Boolean(createErrors.fileUrl)}
                          value={fileUrl}
                          onChange={(event) => { setFileUrl(event.target.value); setCreateErrors((prev) => clearFieldError(prev, 'fileUrl')); }}
                          maxLength={2048}
                          placeholder="https://..."
                        />
                      ) : (
                        <span id="material-create-fileurl">{selectedFile?.name ?? t('admin.materials.noFileSelected', 'No file selected')}</span>
                      )}
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
                        aria-label={t('admin.materials.filePicker', 'Choose a material file')}
                        onChange={(event) => void handleFileSelect(event, 'create')}
                      />
                    </div>
                    {kind === 'file' ? (
                      <span className="admin-upload__hint">
                        {t('admin.materials.dropHint', 'Drag and drop a PDF, MP4, MP3, DOCX, or XLSX file here (max 50 MB).')}
                      </span>
                    ) : null}
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
              materials={loadState.data.materials.filter((material) => {
                const matchesSearch =
                  !materialSearch.trim() || material.title.toLowerCase().includes(materialSearch.trim().toLowerCase());
                const matchesKind = materialKindFilter === 'all' || material.kind === materialKindFilter;
                return matchesSearch && matchesKind;
              })}
              t={t}
              onEdit={(materialId) => {
                const material = loadState.data.materials.find((item) => item.id === materialId);
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
          <FormField
            id="material-edit-fileurl"
            label={editKind === 'link' ? t('admin.materials.fileUrl', 'URL') : t('admin.materials.file', 'File')}
            required={editKind === 'link'}
            error={editErrors.fileUrl}
          >
            <div
              className={`admin-upload${editKind === 'file' ? ' admin-upload--dropzone' : ''}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleFileDrop(event, 'edit')}
            >
              <div className="admin-upload__row">
                {editKind === 'link' ? (
                  <input
                    id="material-edit-fileurl"
                    aria-describedby={editErrors.fileUrl ? 'material-edit-fileurl-error' : undefined}
                    aria-invalid={Boolean(editErrors.fileUrl)}
                    value={editFileUrl}
                    onChange={(event) => { setEditFileUrl(event.target.value); setEditErrors((prev) => clearFieldError(prev, 'fileUrl')); }}
                    maxLength={2048}
                  />
                ) : (
                  <span id="material-edit-fileurl">{editSelectedFile?.name ?? (editFileName || t('admin.materials.noFileSelected', 'No file selected'))}</span>
                )}
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
                  aria-label={t('admin.materials.replaceFilePicker', 'Choose a replacement material file')}
                  onChange={(event) => void handleFileSelect(event, 'edit')}
                />
              </div>
              {editKind === 'file' ? (
                <span className="admin-upload__hint">
                  {t('admin.materials.dropHint', 'Drag and drop a PDF, MP4, MP3, DOCX, or XLSX file here (max 50 MB).')}
                </span>
              ) : null}
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
            <AdminStatusSelect value={editStatus} statuses={MATERIAL_STATUSES} labels={statusLabels} onChange={(status) => setEditStatus(status)} className="admin-form-status-select" />
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
