import { RichDescription } from '../shared/RichDescription.js';
import type { TFunction } from 'i18next';

import type { ChecklistItemSummary } from '../shared/api/types.js';
import { Textarea } from '../shared/ui.js';

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
    <Textarea
      aria-required={required || undefined}
      disabled={disabled}
      hint={hint}
      id={id}
      label={required ? t('checklists.noteRequired', 'Explanation (required)') : t('checklists.note', 'Explanation')}
      maxLength={1000}
      onChange={(event) => onChange(event.target.value)}
      rows={2}
      value={value}
    />
  );
}
