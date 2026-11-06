import { RichText } from '../shared/RichText.js';
import { checklistLabel } from '@lms/shared/checklist-numbering';
import type { FeedbackAnswers, FeedbackConfig } from '@lms/shared/checklist-feedback';
import { isCustomFeedback } from '@lms/shared/checklist-feedback';
import { FeedbackFields as ConfiguredFeedbackFields } from '../features/checklist-feedback/FeedbackFields.js';
import type { TFunction } from 'i18next';
import type { ContextField } from '../shared/api/types.js';
import { RichFillField } from './ChecklistItemNote.js';
import { RichTextField } from '../shared/RichTextField.js';

export type FeedbackDraft = { answers?: FeedbackAnswers; strengths: string; developmentAreas: string; nextSteps: string };

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
      {fields.map((field) => {
        const caption = (
          <span>
            <RichText value={field.label} />{field.required ? ` ${t('common.requiredMark', '*')}` : ''}
          </span>
        );
        const wrapper = { display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 } as const;
        // PR 428: a multi-line field is a formatted editor, so it is labelled by aria-labelledby, not wrapped in a <label>.
        if (field.type === 'textarea') {
          return (
            <div key={field.id} style={wrapper}>
              {caption}
              <RichTextField
                id={`context-${field.id}`}
                label={field.label}
                hideLabel
                disabled={disabled}
                maxLength={4000}
                value={values[field.id] ?? ''}
                onChange={(value) => onChange(field.id, value)}
              />
            </div>
          );
        }
        return (
          <label key={field.id} style={wrapper}>
            {caption}
            <input
              disabled={disabled}
              maxLength={field.type === 'date' ? undefined : 4000}
              required={field.required}
              type={field.type === 'date' ? 'date' : 'text'}
              value={values[field.id] ?? ''}
              onChange={(event) => onChange(field.id, event.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}


export function CriterionHeading({ text, number, required, t }: { number?: string; text: string; required: boolean; t: TFunction }) {
  return <>
      <p style={{ fontWeight: 600, margin: '0 0 6px' }}>{checklistLabel('', number)}<span><RichText value={text} /></span></p>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 12, margin: '0 0 10px' }}>
        {required ? t('checklists.requiredItem', 'Required') : t('checklists.optionalItem', 'Optional')}
      </p>
  </>;
}

export function FeedbackFields({ draft, disabled = false, onDraftChange, t, config }: {
  config?: FeedbackConfig | null;
  draft: FeedbackDraft; disabled?: boolean; onDraftChange: (draft: FeedbackDraft) => void; t: TFunction;
}) {
  if (config && isCustomFeedback(config.layout)) return <ConfiguredFeedbackFields config={config} answers={draft.answers ?? {}} disabled={disabled} onChange={(answers) => onDraftChange({ ...draft, answers })} t={t} />;
  return <>
        <RichFillField id="conduct-strengths" label={t('checklistSessions.conduct.strengths', 'Strengths')} value={draft.strengths} disabled={disabled} maxLength={4000} onChange={(value) => onDraftChange({ ...draft, strengths: value })} />
        <RichFillField id="conduct-developmentAreas" label={t('checklistSessions.conduct.developmentAreas', 'Development areas')} value={draft.developmentAreas} disabled={disabled} maxLength={4000} onChange={(value) => onDraftChange({ ...draft, developmentAreas: value })} />
        <RichFillField id="conduct-nextSteps" label={t('checklistSessions.conduct.nextSteps', 'Next steps')} value={draft.nextSteps} disabled={disabled} maxLength={4000} onChange={(value) => onDraftChange({ ...draft, nextSteps: value })} />
  </>;
}
