import { useId, type FormEvent } from 'react';
import type { TFunction } from 'i18next';
import { slugify } from '../../shared/slugify.js';
import { AdminStatusSelect } from '../../shared/AdminStatusSelect.js';
import { FormField } from '../../shared/adminPage.js';
import { ASSESSMENT_STATUSES, type AssessmentForm, type FormAction, type Lesson, type SaveState } from './model.js';

type Props = {
  form: AssessmentForm;
  dispatch: (action: FormAction) => void;
  state: SaveState;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  t: TFunction;
  lessons?: Lesson[];
  lessonId?: string;
  onLessonChange?: (id: string) => void;
  editing?: boolean;
  onCancel?: () => void;
  titleError?: string;
  onTitleChange?: (value: string) => void;
  statusLabels?: Partial<Record<AssessmentForm['status'], string>>;
};

export function AssessmentSettingsForm({ form, dispatch, state, onSubmit, t, lessons, lessonId, onLessonChange, editing = false, onCancel, titleError, onTitleChange, statusLabels }: Props) {
  const uid = useId();
  const change = (field: keyof AssessmentForm, value: string | boolean) => dispatch({ type: 'change', field, value });

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      {lessons ? (
        <FormField id={`${uid}-lesson`} label={t('admin.assessmentBuilder.lesson', 'Lesson')}>
          <select id={`${uid}-lesson`} value={lessonId} onChange={(e) => onLessonChange?.(e.target.value)}>
            <option value="">{t('admin.assessmentBuilder.noLesson', 'No lesson (course-level)')}</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>{lesson.order}. {lesson.title}</option>
            ))}
          </select>
        </FormField>
      ) : null}

      <FormField
        id={`${uid}-title`}
        label={t('admin.assessmentBuilder.assessmentTitle', 'Title')}
        required
        error={titleError}
        hint={!editing && form.title.trim() ? `slug: ${slugify(form.title, 120)}` : undefined}
      >
        <input
          id={`${uid}-title`}
          aria-describedby={titleError ? `${uid}-title-error` : undefined}
          aria-invalid={Boolean(titleError)}
          value={form.title}
          onChange={(e) => { change('title', e.target.value); onTitleChange?.(e.target.value); }}
          maxLength={200}
        />
      </FormField>

      <FormField id={`${uid}-passing-score`} label={t('admin.assessmentBuilder.passingScore', 'Passing score (0–100)')}>
        <input id={`${uid}-passing-score`} value={form.passingScore} onChange={(e) => change('passingScore', e.target.value)} inputMode="numeric" />
      </FormField>

      <FormField id={`${uid}-max-attempts`} label={t('admin.assessmentBuilder.maxAttempts', 'Max attempts (blank = unlimited)')}>
        <input id={`${uid}-max-attempts`} value={form.maxAttempts} onChange={(e) => change('maxAttempts', e.target.value)} inputMode="numeric" />
      </FormField>

      {editing ? (
        <FormField id={`${uid}-status`} label={t('admin.assessmentBuilder.col.status', 'Status')}>
          <AdminStatusSelect value={form.status} statuses={ASSESSMENT_STATUSES} labels={statusLabels} onChange={(value) => change('status', value)} className="admin-form-status-select" />
        </FormField>
      ) : null}

      <div className="admin-form__field">
        <label>
          <input type="checkbox" checked={form.availableAfterCourseCompletion} onChange={(e) => change('availableAfterCourseCompletion', e.target.checked)} />
          {' '}{t('admin.assessmentBuilder.availableAfterCompletion', 'Available after course completion')}
        </label>
      </div>

      <div className="admin-form__field">
        <label>
          <input type="checkbox" checked={form.showCorrectAnswers} onChange={(e) => change('showCorrectAnswers', e.target.checked)} />
          {' '}{t('admin.assessmentBuilder.showCorrectAnswers', 'Show correct answers after submission')}
        </label>
      </div>

      <FormField id={`${uid}-description`} label={t('admin.assessmentBuilder.description', 'Description')}>
        <textarea id={`${uid}-description`} value={form.description} onChange={(e) => change('description', e.target.value)} maxLength={2000} />
      </FormField>

      {state.status === 'error' ? <p className="admin-form__error" role="alert">{state.message}</p> : null}

      <div className="admin-form__actions">
        <button className="admin-btn admin-btn--primary" type="submit" disabled={state.status === 'saving'}>
          {state.status === 'saving'
            ? t(`admin.assessmentBuilder.${editing ? 'updating' : 'saving'}`, editing ? 'Saving...' : 'Creating...')
            : t(`admin.assessmentBuilder.${editing ? 'update' : 'create'}`, editing ? 'Save changes' : 'Create assessment')}
        </button>
        {onCancel ? (
          <button className="admin-btn admin-btn--secondary" type="button" onClick={onCancel}>
            {t('admin.assessmentBuilder.cancel', 'Cancel')}
          </button>
        ) : null}
      </div>
    </form>
  );
}
