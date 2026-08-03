import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createCourse, getCourse, getCurrentUser, updateCourse } from '../shared/apiClient.js';
import { listLessons } from '../shared/api/lessons.js';
import type { LessonSummary } from '../shared/api/types.js';
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
  | { status: 'loaded'; organizationId: string; firstName: string; lastName: string | null; lessons: LessonSummary[]; updatedAt: string | null }
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

        let lessons: LessonSummary[] = [];
        let updatedAt: string | null = null;

        if (mode === 'edit' && courseId) {
          const [course, courseLessons] = await Promise.all([getCourse(courseId), listLessons(courseId)]);
          if (!isMounted) return;
          setForm({ title: course.title, slug: course.slug, description: course.description ?? '', status: course.status });
          lessons = [...courseLessons].sort((a, b) => a.order - b.order);
          updatedAt = course.updatedAt;
        }

        setLoadState({
          status: 'loaded',
          organizationId: user.organizationId,
          firstName: user.firstName,
          lastName: user.lastName,
          lessons,
          updatedAt,
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
  const lessons = loadState.status === 'loaded' ? loadState.lessons : [];
  const updatedAt = loadState.status === 'loaded' ? loadState.updatedAt : null;

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

      {mode === 'edit' && loadState.status === 'loaded' && (
        <div style={{ maxWidth: '36rem', marginTop: '2rem', display: 'grid', gap: '16px' }}>
          <div style={{ border: '1px solid #e3e8ef', borderRadius: '14px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <strong>Статус публикации</strong>
              <span
                style={{
                  borderRadius: '999px',
                  padding: '5px 9px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: form.status === 'published' ? '#e9f8f2' : '#eef2ff',
                  color: form.status === 'published' ? '#0f9f6e' : '#4f46e5',
                }}
              >
                {form.status === 'published' ? 'Опубликован' : 'Черновик'}
              </span>
            </div>
            {updatedAt ? (
              <span style={{ color: '#6b7280', fontSize: '13px' }}>
                Последнее обновление: {new Date(updatedAt).toLocaleDateString('ru-RU')}
              </span>
            ) : null}
          </div>

          <div style={{ border: '1px solid #e3e8ef', borderRadius: '14px', padding: '16px' }}>
            <strong style={{ display: 'block', marginBottom: '10px' }}>Уроки ({lessons.length})</strong>
            {lessons.length === 0 ? (
              <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Уроки ещё не добавлены.</p>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '8px' }}>
                {lessons.map((lesson) => (
                  <li
                    key={lesson.id}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #e3e8ef', borderRadius: '10px' }}
                  >
                    <span>{lesson.order}. {lesson.title}</span>
                    <span
                      style={{
                        borderRadius: '999px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: lesson.status === 'published' ? '#e9f8f2' : '#f8fafc',
                        color: lesson.status === 'published' ? '#0f9f6e' : '#6b7280',
                      }}
                    >
                      {lesson.status === 'published' ? 'Опубликован' : 'Черновик'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </InstructorPageLayout>
  );
}
