import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { filterLessons, parseLessonOrder } from './admin-lessons/model.js';
import { slugify } from '../shared/slugify.js';
import { AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { clearFieldError, hasValidationErrors, validateRequiredFields, type FormValidationErrors } from '../shared/formValidation.js';
import { Badge, Button, EmptyState, PageState, SearchInput, Toolbar } from '../shared/ui.js';
import type { PaginatedResponse } from '../shared/api/types.js';

type Course = { id: string; organizationId: string; title: string; slug: string; status: string };
type Lesson = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  type: string;
  order: number;
  status: string;
  courseId: string;
  course: { title: string };
};

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; courses: Course[]; lessons: Lesson[] }
  | { status: 'error'; message: string };

type LessonStatus = 'draft' | 'published' | 'archived';
type LessonType = 'video' | 'text';

const LESSON_STATUSES: LessonStatus[] = ['draft', 'published', 'archived'];
const LESSON_TYPES: LessonType[] = ['video', 'text'];

export function AdminLessonsPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | LessonType>('all');

  const createDialogRef = useRef<HTMLDialogElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createCourseId, setCreateCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<LessonType>('text');
  const [description, setDescription] = useState('');
  const [order, setOrder] = useState('0');
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [createErrors, setCreateErrors] = useState<FormValidationErrors<'title'>>({});

  const editDialogRef = useRef<HTMLDialogElement>(null);
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState<LessonType>('text');
  const [editDescription, setEditDescription] = useState('');
  const [editOrder, setEditOrder] = useState('0');
  const [editStatus, setEditStatus] = useState<LessonStatus>('draft');
  const [editState, setEditState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [editErrors, setEditErrors] = useState<FormValidationErrors<'title'>>({});

  const load = useCallback(async () => {
    try {
      const [{ items: courses }, { items: lessons }] = await Promise.all([
        apiRequest<PaginatedResponse<Course>>('/courses?pageSize=200'),
        apiRequest<PaginatedResponse<Lesson>>('/lessons?pageSize=200'),
      ]);

      setLoadState({ status: 'loaded', courses, lessons });
      setCreateCourseId((prev) => prev || courses[0]?.id || '');
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 401
          ? t('admin.lessons.sessionExpired', 'Your session expired. Sign in again.')
          : t('admin.lessons.loadError', 'Unable to load lesson editor.');
      setLoadState({ status: 'error', message });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showCreate) createDialogRef.current?.showModal();
    else createDialogRef.current?.close();
  }, [showCreate]);

  function openCreateDialog() {
    setTitle('');
    setType('text');
    setDescription('');
    setOrder('0');
    setCreateErrors({});
    setSubmitState({ status: 'idle' });
    setShowCreate(true);
  }

  async function handleCreateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded') return;
    const course = loadState.courses.find((c) => c.id === createCourseId);
    if (!course) return;

    const lessonTitle = title.trim();
    const slug = slugify(lessonTitle);

    const errors = validateRequiredFields([{ name: 'title', value: lessonTitle, message: t('admin.lessons.titleRequired', 'Lesson title is required.') }]);
    if (hasValidationErrors(errors)) { setCreateErrors(errors); return; }
    setCreateErrors({});

    const orderValue = parseLessonOrder(order);
    if (orderValue === null) {
      setSubmitState({ status: 'error', message: t('admin.lessons.invalidInput', 'Enter a non-negative order number.') });
      return;
    }

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<Lesson>(`/courses/${encodeURIComponent(course.id)}/lessons`, {
        method: 'POST',
        body: JSON.stringify({
          organizationId: course.organizationId,
          title: lessonTitle,
          slug,
          type,
          description: description.trim() || undefined,
          order: orderValue,
          status: 'draft',
        }),
      });
      setShowCreate(false);
      await load();
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 409
          ? t('admin.lessons.lessonExists', 'A lesson with this slug already exists in the selected course.')
          : t('admin.lessons.saveError', 'Unable to create lesson.');
      setSubmitState({ status: 'error', message });
    }
  }

  function openEditDialog(lesson: Lesson) {
    setEditLesson(lesson);
    setEditTitle(lesson.title);
    setEditType(lesson.type as LessonType);
    setEditDescription(lesson.description ?? '');
    setEditOrder(String(lesson.order));
    setEditStatus(lesson.status as LessonStatus);
    setEditState({ status: 'idle' });
    setEditErrors({});
    editDialogRef.current?.showModal();
  }

  async function handleUpdateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editLesson) return;

    const newTitle = editTitle.trim();

    const titleErrors = validateRequiredFields([{ name: 'title', value: newTitle, message: t('admin.lessons.titleRequired', 'Lesson title is required.') }]);
    if (hasValidationErrors(titleErrors)) { setEditErrors(titleErrors); return; }
    setEditErrors({});

    const newOrder = parseLessonOrder(editOrder);
    if (newOrder === null) {
      setEditState({ status: 'error', message: t('admin.lessons.invalidInput', 'Enter a non-negative order number.') });
      return;
    }

    setEditState({ status: 'saving' });

    try {
      await apiRequest<Lesson>(`/lessons/${encodeURIComponent(editLesson.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: newTitle,
          description: editDescription.trim() || null,
          type: editType,
          order: newOrder,
          status: editStatus,
        }),
      });
      editDialogRef.current?.close();
      setEditLesson(null);
      await load();
    } catch {
      setEditState({ status: 'error', message: t('admin.lessons.editError', 'Unable to update lesson.') });
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.lessons.loading', 'Loading lesson editor...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.lessons.title', 'Lessons')} message={loadState.message} variant="error" />
      </main>
    );
  }

  const filteredLessons = filterLessons(loadState.lessons, search, typeFilter);

  const navItems: AdminNavItem[] = [
    { label: t('admin.courseBuilder.title', 'Course builder'), href: '/admin/courses' },
    { label: t('admin.lessons.title', 'Lessons'), href: '/admin/lessons', isCurrent: true },
  ];

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.navLink', 'Admin')}
      navItems={navItems}
    >
      <AdminPageHeader
        eyebrow={t('admin.lessons.eyebrow', 'Learning content')}
        title={t('admin.lessons.title', 'Lessons')}
        subtitle={t('admin.lessons.subtitle', 'Manage lessons and publishing.')}
        action={
          <Button variant="primary" type="button" onClick={openCreateDialog} disabled={loadState.courses.length === 0}>
            + {t('admin.lessons.createTitle', 'Create lesson')}
          </Button>
        }
      />

      <Toolbar
        left={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('admin.lessons.searchPlaceholder', 'Find lesson')}
          />
        }
        right={
          <select
            className="admin-status-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | LessonType)}
          >
            <option value="all">{t('admin.lessons.allTypes', 'All types')}</option>
            <option value="video">{t('admin.lessons.typeVideo', 'Video')}</option>
            <option value="text">{t('admin.lessons.typeText', 'Text')}</option>
          </select>
        }
      />

      {filteredLessons.length === 0 ? (
        <EmptyState message={t('admin.lessons.noResults', 'No lessons found.')} />
      ) : (
        <div className="admin-lesson-grid">
          {filteredLessons.map((lesson) => (
            <button key={lesson.id} type="button" className="admin-lesson-card" onClick={() => openEditDialog(lesson)}>
              <Badge>{lesson.type === 'video' ? t('admin.lessons.typeVideo', 'Video') : t('admin.lessons.typeText', 'Text')}</Badge>
              <h3>{lesson.title}</h3>
              <p>{lesson.course.title}</p>
            </button>
          ))}
        </div>
      )}

      <dialog ref={createDialogRef} className="admin-dialog" onClose={() => setShowCreate(false)}>
        <header className="admin-dialog__header">
          <h2>{t('admin.lessons.createTitle', 'Create lesson')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.lessons.close', 'Close')} onClick={() => setShowCreate(false)}>
            ×
          </button>
        </header>
        {loadState.courses.length === 0 ? (
          <EmptyState message={t('admin.lessons.noCourses', 'Create a course before adding lessons.')} />
        ) : (
          <form className="admin-form" onSubmit={handleCreateLesson}>
            <FormField id="lesson-create-course" label={t('admin.lessons.course', 'Course')}>
              <select id="lesson-create-course" value={createCourseId} onChange={(event) => setCreateCourseId(event.target.value)}>
                {loadState.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="lesson-create-title" label={t('admin.lessons.lessonTitle', 'Lesson title')} required error={createErrors.title}>
              <input id="lesson-create-title" aria-describedby={createErrors.title ? 'lesson-create-title-error' : undefined} aria-invalid={Boolean(createErrors.title)} value={title} onChange={(event) => { setTitle(event.target.value); setCreateErrors((prev) => clearFieldError(prev, 'title')); }} maxLength={160} />
            </FormField>
            <FormField id="lesson-create-type" label={t('admin.lessons.fieldType', 'Type')}>
              <select id="lesson-create-type" value={type} onChange={(event) => setType(event.target.value as LessonType)}>
                {LESSON_TYPES.map((lessonType) => (
                  <option key={lessonType} value={lessonType}>
                    {lessonType === 'video' ? t('admin.lessons.typeVideo', 'Video') : t('admin.lessons.typeText', 'Text')}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="lesson-create-order" label={t('admin.lessons.order', 'Order')}>
              <input id="lesson-create-order" value={order} onChange={(event) => setOrder(event.target.value)} inputMode="numeric" />
            </FormField>
            <FormField id="lesson-create-description" label={t('admin.lessons.description', 'Description')}>
              <textarea id="lesson-create-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
            </FormField>
            {submitState.status === 'error' ? (
              <p className="admin-form__error" role="alert">{submitState.message}</p>
            ) : null}
            <div className="admin-form__actions">
              <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setShowCreate(false)}>
                {t('admin.lessons.cancel', 'Cancel')}
              </button>
              <button className="admin-btn admin-btn--primary" type="submit" disabled={submitState.status === 'saving'}>
                {submitState.status === 'saving' ? t('admin.lessons.saving', 'Creating...') : t('admin.lessons.create', 'Create draft')}
              </button>
            </div>
          </form>
        )}
      </dialog>

      <dialog ref={editDialogRef} className="admin-dialog" onClose={() => setEditLesson(null)}>
        <header className="admin-dialog__header">
          <h2>{t('admin.lessons.editTitle', 'Edit lesson')}</h2>
          <button
            className="admin-dialog__close"
            type="button"
            aria-label={t('admin.lessons.close', 'Close')}
            onClick={() => editDialogRef.current?.close()}
          >
            ×
          </button>
        </header>
        <form className="admin-form" onSubmit={handleUpdateLesson}>
          <FormField id="lesson-edit-title" label={t('admin.lessons.lessonTitle', 'Lesson title')} required error={editErrors.title}>
            <input id="lesson-edit-title" aria-describedby={editErrors.title ? 'lesson-edit-title-error' : undefined} aria-invalid={Boolean(editErrors.title)} value={editTitle} onChange={(event) => { setEditTitle(event.target.value); setEditErrors((prev) => clearFieldError(prev, 'title')); }} maxLength={160} />
          </FormField>
          <FormField id="lesson-edit-type" label={t('admin.lessons.fieldType', 'Type')}>
            <select id="lesson-edit-type" value={editType} onChange={(event) => setEditType(event.target.value as LessonType)}>
              {LESSON_TYPES.map((lessonType) => (
                <option key={lessonType} value={lessonType}>
                  {lessonType === 'video' ? t('admin.lessons.typeVideo', 'Video') : t('admin.lessons.typeText', 'Text')}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="lesson-edit-order" label={t('admin.lessons.order', 'Order')}>
            <input id="lesson-edit-order" value={editOrder} onChange={(event) => setEditOrder(event.target.value)} inputMode="numeric" />
          </FormField>
          <FormField id="lesson-edit-status" label={t('admin.lessons.col.status', 'Status')}>
            <select id="lesson-edit-status" value={editStatus} onChange={(event) => setEditStatus(event.target.value as LessonStatus)}>
              {LESSON_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="lesson-edit-description" label={t('admin.lessons.description', 'Description')}>
            <textarea id="lesson-edit-description" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={1000} />
          </FormField>
          {editState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{editState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => editDialogRef.current?.close()}>
              {t('admin.lessons.cancel', 'Cancel')}
            </button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={editState.status === 'saving'}>
              {editState.status === 'saving' ? t('admin.lessons.updating', 'Saving...') : t('admin.lessons.update', 'Save changes')}
            </button>
          </div>
        </form>
      </dialog>
    </AdminPageLayout>
  );
}
