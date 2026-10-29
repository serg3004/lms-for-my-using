import type { TFunction } from 'i18next';
import type { ContextField } from '../shared/api/types.js';
import { Textarea } from '../shared/ui.js';

export type FeedbackDraft = { strengths: string; developmentAreas: string; nextSteps: string };

export function ContextFields({
  fields,
  values,
  disabled,
  onChange,
  t,
}: {
  fields: ContextField[];
  values: Record<string, string>;
  disabled: boolean;
  onChange: (fieldId: string, value: string) => void;
  t: TFunction;
}) {
  return (
    <div className="admin-card" style={{ display: 'grid', gap: 12 }}>
      {fields.map((field) => (
        <label key={field.id} style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          <span>
            {field.label}{field.required ? ` ${t('common.requiredMark', '*')}` : ''}
          </span>
          {field.type === 'textarea' ? (
            <textarea
              disabled={disabled}
              maxLength={4000}
              required={field.required}
              rows={3}
              value={values[field.id] ?? ''}
              onChange={(event) => onChange(field.id, event.target.value)}
              style={{ minHeight: 88, resize: 'vertical' }}
            />
          ) : (
            <input
              disabled={disabled}
              maxLength={field.type === 'date' ? undefined : 4000}
              required={field.required}
              type={field.type === 'date' ? 'date' : 'text'}
              value={values[field.id] ?? ''}
              onChange={(event) => onChange(field.id, event.target.value)}
            />
          )}
        </label>
      ))}
    </div>
  );
}


export function CriterionHeading({ text, required, t }: { text: string; required: boolean; t: TFunction }) {
  return <>
      <p style={{ fontWeight: 600, margin: '0 0 6px' }}>{text}</p>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 12, margin: '0 0 10px' }}>
        {required ? t('checklists.requiredItem', 'Required') : t('checklists.optionalItem', 'Optional')}
      </p>
  </>;
}

export function FeedbackFields({ draft, disabled = false, onDraftChange, t }: {
  draft: FeedbackDraft; disabled?: boolean; onDraftChange: (draft: FeedbackDraft) => void; t: TFunction;
}) {
  return <>
        <Textarea
          label={t('checklistSessions.conduct.strengths', 'Strengths')}
          value={draft.strengths}
          disabled={disabled}
          onChange={(e) => onDraftChange({ ...draft, strengths: e.target.value })}
          rows={2}
        />
        <Textarea
          label={t('checklistSessions.conduct.developmentAreas', 'Development areas')}
          value={draft.developmentAreas}
          disabled={disabled}
          onChange={(e) => onDraftChange({ ...draft, developmentAreas: e.target.value })}
          rows={2}
        />
        <Textarea
          label={t('checklistSessions.conduct.nextSteps', 'Next steps')}
          value={draft.nextSteps}
          disabled={disabled}
          onChange={(e) => onDraftChange({ ...draft, nextSteps: e.target.value })}
          rows={2}
        />
  </>;
}
