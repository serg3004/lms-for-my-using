import { RichDescription } from '../shared/RichDescription.js';
import type { TFunction } from 'i18next';

import type { ChecklistItemSummary } from '../shared/api/types.js';
import { RichTextField } from '../shared/RichTextField.js';

/** PR 415: the description of a criterion, a hint for whoever fills the sheet (collapsed, never an answer). */
export function ChecklistItemDescription({ item, t }: { item: Pick<ChecklistItemSummary, 'description' | 'descriptionEnabled'>; t: TFunction }) {
  if (!item.descriptionEnabled || !item.description?.trim()) return null;
  return (
    <details style={{ margin: '4px 0 10px', fontSize: 13 }}>
      <summary style={{ cursor: 'pointer', minHeight: 32 }}>{t('checklists.itemDescription', 'Description')}</summary>
      <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}><RichDescription value={item.description} /></p>
    </details>
  );
}

/** PR 428: a fill-in text field with the formatting window (stored as sanitized rich text, shown as a rich paragraph). */
export function RichFillField({ id, label, value, onChange, disabled, hint, required, maxLength = 1000, invalid }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  invalid?: boolean;
}) {
  const hintId = hint ? `${id}-fill-hint` : undefined;
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 0 }} aria-required={required || undefined}>
      <RichTextField id={id} label={label} value={value} onChange={onChange} disabled={disabled} maxLength={maxLength} compact invalid={invalid} describedBy={hintId} />
      {hint && <p id={hintId} role="status" className="admin-form__hint" style={{ margin: 0 }}>{hint}</p>}
    </div>
  );
}

/** PR 415: the explanation field that a criterion's rule offers (stored as the result's comment). */
export function ChecklistNoteField({ id, required, value, disabled, onChange, hint, t }: {
  id: string;
  required: boolean;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  hint?: string;
  t: TFunction;
}) {
  return (
    <RichFillField
      disabled={disabled}
      hint={hint}
      id={id}
      label={required ? t('checklists.noteRequired', 'Explanation (required)') : t('checklists.note', 'Explanation')}
      maxLength={1000}
      onChange={onChange}
      required={required}
      value={value}
    />
  );
}
