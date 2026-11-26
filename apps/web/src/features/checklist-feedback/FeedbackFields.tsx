import { RichText, plainText } from '../../shared/RichText.js';
import { useId, useRef, type ReactNode } from 'react';
import { DictationButton } from '../../shared/DictationButton.js';
import { RichTextField } from '../../shared/RichTextField.js';
import type { TFunction } from 'i18next';
import { feedbackRows, type FeedbackAnswers, type FeedbackConfig, type FeedbackFieldDef, type FeedbackSectionDef } from '@lms/shared/checklist-feedback';
export const feedbackLabels = (t: TFunction) => ({ strengths: t('checklistSessions.conduct.strengths'), developmentAreas: t('checklistSessions.conduct.developmentAreas'), nextSteps: t('checklistSessions.conduct.nextSteps') });
/** PR 512: a text answer of the feedback section; the microphone sits beside the field, not inside its label. */
function TextAnswer({ id, name, label, required, missing, disabled, value, onChange, dictation }: { id: string; name: ReactNode; label: string; required: boolean; missing: boolean; disabled: boolean; value: string; onChange: (value: string) => void; dictation: boolean }) {
  const insertRef = useRef<((text: string) => boolean) | null>(null);
  return <>
    <label htmlFor={id} style={{ display: 'grid', gap: 6 }}><span>{name}{required ? ' *' : ''}</span><RichTextField id={id} label={required ? `${label} *` : label} hideLabel hideHint maxLength={4000} invalid={missing} disabled={disabled} value={value} onChange={onChange} insertTextRef={dictation ? insertRef : undefined} /></label>
    {dictation && <DictationButton disabled={disabled} id={id} onText={(text) => { insertRef.current?.(text); }} />}
  </>;
}
export function FeedbackFields({ config, answers, onChange, disabled = false, t, dictation = false, extra }: { config: FeedbackConfig; answers: FeedbackAnswers; onChange: (answers: FeedbackAnswers) => void; disabled?: boolean; t: TFunction; dictation?: boolean; /** PR 512: what goes under a text field (the voice recordings of the three built-in texts). */ extra?: (field: FeedbackFieldDef) => ReactNode }) {
  const prefix = useId(), labels = feedbackLabels(t);
  function field(field: FeedbackFieldDef) {
    const name = field.title || (field.builtin ? labels[field.builtin] : ''), id = `${prefix}-${field.id}`, value = answers[field.id];
    const selected = Array.isArray(value) ? value : [];
    const missing = field.required && !(field.kind === 'text' ? typeof value === 'string' && value.trim() : selected.length);
    const options = config.answerSets[field.answerSetId ?? '']?.options ?? [];
    return <div key={field.id} style={{ minWidth: 0, marginBlock: 12, ...(missing ? { borderInlineStart: '3px solid var(--color-danger)', paddingInlineStart: 10 } : {}) }}>
      {field.kind === 'text' ? <><TextAnswer id={id} name={<RichText value={name} />} label={name} required={field.required} missing={Boolean(missing)} disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={(next) => onChange({ ...answers, [field.id]: next })} dictation={dictation} />{extra?.(field)}</> : <fieldset disabled={disabled} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, minWidth: 0 }}>
        <legend><RichText value={name} />{field.required ? ' *' : ''}</legend>
        {options.map((option) => <label key={option.id} style={{ display: 'flex', alignItems: 'start', gap: 10, minHeight: 44, paddingBlock: 6, overflowWrap: 'anywhere' }}>
          <input style={{ width: 'auto', marginTop: 4 }} type={field.multiple ? 'checkbox' : 'radio'} name={id} value={option.id} aria-required={field.required} checked={selected.includes(option.id)} onChange={(event) => onChange({ ...answers, [field.id]: field.multiple ? event.target.checked ? [...selected, option.id] : selected.filter((value) => value !== option.id) : [option.id] })} />
          <span>{option.name}{option.description && <span style={{ display: 'block', fontWeight: 400 }}><RichText value={option.description} /></span>}</span>
        </label>)}
        {!options.length && <p role="alert">{t('feedbackBuilder.unavailableSet')}</p>}
      </fieldset>}
    </div>;
  }
  function sections(list: FeedbackSectionDef[], depth = 0) { return list.map((section) => <section key={section.id} aria-label={plainText(section.title)} style={{ marginBlock: 16, paddingInlineStart: depth ? 12 : 0, borderInlineStart: depth ? '2px solid var(--color-border)' : undefined }}><h4><RichText value={section.title} /></h4>{section.fields.map(field)}{sections(section.sections, depth + 1)}</section>); }
  return <>{config.layout.fields.map(field)}{sections(config.layout.sections)}</>;
}
export function FeedbackReadOnly({ config, answers, t }: { config: FeedbackConfig; answers: FeedbackAnswers; t: TFunction }) {
  const rows = feedbackRows(config, answers, feedbackLabels(t));
  return <section aria-label={plainText(config.layout.title || t('admin.checklists.feedbackSectionTitle'))} style={{ overflowWrap: 'anywhere' }}><h3><RichText value={config.layout.title || t('admin.checklists.feedbackSectionTitle')} /></h3>{rows.map((row) => row.kind === 'section' ? <h4 key={row.id} style={{ paddingInlineStart: row.depth * 8 }}><RichText value={row.title} /></h4> : <p key={row.id} style={{ paddingInlineStart: row.depth * 8, whiteSpace: 'pre-wrap' }}><strong><RichText value={row.title} />:</strong> <RichText value={row.value || '—'} /></p>)}</section>;
}
