import { RichText, plainText } from '../../shared/RichText.js';
import { useId } from 'react';
import { RichTextField } from '../../shared/RichTextField.js';
import type { TFunction } from 'i18next';
import { feedbackRows, type FeedbackAnswers, type FeedbackConfig, type FeedbackFieldDef, type FeedbackSectionDef } from '@lms/shared/checklist-feedback';
export const feedbackLabels = (t: TFunction) => ({ strengths: t('checklistSessions.conduct.strengths'), developmentAreas: t('checklistSessions.conduct.developmentAreas'), nextSteps: t('checklistSessions.conduct.nextSteps') });
export function FeedbackFields({ config, answers, onChange, disabled = false, t }: { config: FeedbackConfig; answers: FeedbackAnswers; onChange: (answers: FeedbackAnswers) => void; disabled?: boolean; t: TFunction }) {
  const prefix = useId(), labels = feedbackLabels(t);
  function field(field: FeedbackFieldDef) {
    const name = field.title || (field.builtin ? labels[field.builtin] : ''), id = `${prefix}-${field.id}`, value = answers[field.id];
    const selected = Array.isArray(value) ? value : [];
    const missing = field.required && !(field.kind === 'text' ? typeof value === 'string' && value.trim() : selected.length);
    const options = config.answerSets[field.answerSetId ?? '']?.options ?? [];
    return <div key={field.id} style={{ minWidth: 0, marginBlock: 12, ...(missing ? { borderInlineStart: '3px solid var(--color-danger)', paddingInlineStart: 10 } : {}) }}>
      {field.kind === 'text' ? <label htmlFor={id} style={{ display: 'grid', gap: 6 }}><span><RichText value={name} />{field.required ? ' *' : ''}</span><RichTextField id={id} label={field.required ? `${name} *` : name} hideLabel maxLength={4000} invalid={Boolean(missing)} disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={(next) => onChange({ ...answers, [field.id]: next })} /></label> : <fieldset disabled={disabled} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, minWidth: 0 }}>
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
