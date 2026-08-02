import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createCourse, getCourse, getCurrentUser, updateCourse } from '../shared/apiClient.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';

type Mode = 'create' | 'edit';

type FormState = {
  title: string;
  slug: string;
  description: string;
  status: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; organizationId: string; firstName: string; lastName: string | null }
  | { status: 'error'; message: string };

type InstructorCourseFormPageProps = {
  mode: Mode;
  courseId?: string;
};

export function InstructorCourseFormPage({ mode, courseId }: InstructorCourseFormPageProps) {
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [form, setForm] = useState<FormState>({ title: '', slug: '', description: '', status: 'draft' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const user = await getCurrentUser();
        if (!isMounted) return;

        if (mode === 'edit' && courseId) {
          const course = await getCourse(courseId);
          if (!isMounted) return;
          setForm({ title: course.title, slug: course.slug, description: course.description ?? '', status: course.status });
        }

        setLoadState({
          status: 'loaded',
          organizationId: user.organizationId,
          firstName: user.firstName,
          lastName: user.lastName,
        });
      } catch {
        if (isMounted) setLoadState({ status: 'error', message: 'Не удалось загрузить данные.' });
      }
    }

    void load();
    return () => { isMounted = false; };
  }, [mode, courseId]);

  function updateField(field: keyof FormState) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loadState.status !== 'loaded') return;
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'create') {
        await createCourse({
          organizationId: loadState.organizationId,
          title: form.title.trim(),
          slug: form.slug.trim(),
          description: form.description.trim() || undefined,
          status: form.status,
        });
      } else if (courseId) {
        await updateCourse(courseId, {
          title: form.title.trim(),
          slug: form.slug.trim(),
          description: form.description.trim() || undefined,
          status: form.status,
        });
      }
      navigate('/instructor/courses');
    } catch {
      setSubmitError('Не удалось сохранить курс. Попробуйте ещё раз.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const firstName = loadState.status === 'loaded' ? loadState.firstName : undefined;
  const lastName = loadState.status === 'loaded' ? (loadState.lastName ?? undefined) : undefined;
  const pageTitle = mode === 'create' ? 'Создать курс' : 'Редактировать курс';

  return (
    <InstructorPageLayout firstName={firstName} lastName={lastName}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link to="/instructor/courses">← Курсы</Link>
        <h1 style={{ margin: 0 }}>{pageTitle}</h1>
      </div>

      {loadState.status === 'loading' && <p role="status">Загрузка...</p>}
      {loadState.status === 'error' && <p role="alert">{loadState.message}</p>}

      {loadState.status === 'loaded' && (
        <form onSubmit={handleSubmit} style={{ maxWidth: '36rem' }}>
          <label htmlFor="title" style={{ display: 'block', marginBottom: '1rem' }}>
            Название
            <input
              id="title"
              name="title"
              type="text"
              required
              value={form.title}
              onChange={updateField('title')}
              style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
            />
          </label>

          <label htmlFor="slug" style={{ display: 'block', marginBottom: '1rem' }}>
            Slug
            <input
              id="slug"
              name="slug"
              type="text"
              required
              minLength={3}
              maxLength={80}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              value={form.slug}
              onChange={updateField('slug')}
              style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
            />
          </label>

          <label htmlFor="description" style={{ display: 'block', marginBottom: '1rem' }}>
            Описание
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={updateField('description')}
              rows={4}
              style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
            />
          </label>

          <label htmlFor="status" style={{ display: 'block', marginBottom: '1.5rem' }}>
            Статус
            <select
              id="status"
              name="status"
              value={form.status}
              onChange={updateField('status')}
              style={{ display: 'block', marginTop: '0.25rem' }}
            >
              <option value="draft">Черновик</option>
              <option value="published">Опубликован</option>
            </select>
          </label>

          {submitError && (
            <p role="alert" style={{ color: 'red' }}>
              {submitError}
            </p>
          )}

          <button type="submit" disabled={isSubmitting} className="admin-btn admin-btn--primary">
            {isSubmitting ? 'Сохранение...' : mode === 'create' ? 'Создать' : 'Сохранить'}
          </button>
        </form>
      )}
    </InstructorPageLayout>
  );
}
