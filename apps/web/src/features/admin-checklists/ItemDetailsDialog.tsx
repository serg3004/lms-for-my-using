import { RichText } from '../../shared/RichText.js';
import { RichDescriptionEditor } from '../../shared/RichDescriptionEditor.js';
import { useId, useState } from 'react';
import type { TFunction } from 'i18next';

import type { ChecklistItemSummary } from '../../shared/api/types.js';
import { Button, Dialog, Select } from '../../shared/ui.js';
import { NOTE_ANSWER_UNCHECKED } from '../../app/checklistItemNote.js';

const OPTION = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 } as const;

/** One answer that can open the explanation: a level of the criterion's scale, or "not ticked" for a tick box. */
export type NoteAnswerOption = { value: string; label: string };

type Patch = Pick<ChecklistItemSummary, 'description' | 'descriptionEnabled' | 'noteRule' | 'noteAnswers' | 'noteRequired'>;

export function noteAnswerOptions(levels: { value: number; label: string }[] | null, t: TFunction): NoteAnswerOption[] {
  if (levels && levels.length > 0) return levels.map((level) => ({ value: String(level.value), label: level.label }));
  return [{ value: NOTE_ANSWER_UNCHECKED, label: t('admin.checklists.itemDetails.notTicked', 'Not ticked') }];
}

/** PR 415: the two independent switches of a criterion: its description (a hint) and the explanation rule. */
export function ItemDetailsDialog({ item, options, open, onClose, onSave, t }: {
  item: ChecklistItemSummary;
  options: NoteAnswerOption[];
  open: boolean;
  onClose: () => void;
  onSave: (patch: Patch) => Promise<void>;
  t: TFunction;
}) {
  const titleId = useId();
  const [descriptionEnabled, setDescriptionEnabled] = useState(item.descriptionEnabled === true);
  const [description, setDescription] = useState(item.description ?? '');
  const [rule, setRule] = useState<'off' | 'always' | 'on_answers'>(item.noteRule ?? 'off');
  const [answers, setAnswers] = useState<string[]>(item.noteAnswers ?? []);
  const [required, setRequired] = useState(item.noteRequired === true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needAnswer = rule === 'on_answers' && answers.length === 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        descriptionEnabled,
        description: description.trim() === '' ? null : description.trim(),
        noteRule: rule,
        noteAnswers: rule === 'on_answers' ? answers : null,
        noteRequired: rule === 'off' ? false : required,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t('admin.checklists.itemDetails.saveFailed', 'Unable to save.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} open={open}>
      <h2 id={titleId}>{t('admin.checklists.itemDetails.title', 'Criterion: description and explanation')}</h2>
      <p className="admin-form__hint"><RichText value={item.text} /></p>
      {error && <p className="learner-quiz__submit-error" role="alert">{error}</p>}
      <label style={OPTION}>
        <input checked={descriptionEnabled} onChange={(event) => setDescriptionEnabled(event.target.checked)} role="switch" type="checkbox" />
        {t('admin.checklists.itemDetails.descriptionSwitch', 'Description (a hint for whoever fills the sheet)')}
      </label>
      {descriptionEnabled && (
        <RichDescriptionEditor label={t('admin.checklists.itemDetails.descriptionLabel', 'What to check and how to assess it')} value={description} onChange={setDescription} />
      )}
      <Select
        label={t('admin.checklists.itemDetails.ruleLabel', 'Explanation field')}
        onChange={(event) => setRule(event.target.value as typeof rule)}
        value={rule}
      >
        <option value="off">{t('admin.checklists.itemDetails.ruleOff', 'Not needed')}</option>
        <option value="always">{t('admin.checklists.itemDetails.ruleAlways', 'Always show')}</option>
        <option value="on_answers">{t('admin.checklists.itemDetails.ruleOnAnswers', 'Show for chosen answers')}</option>
      </Select>
      {rule === 'on_answers' && (
        <fieldset style={{ border: 0, padding: 0, margin: '12px 0' }}>
          <legend>{t('admin.checklists.itemDetails.answersLegend', 'Show the field when the answer is')}</legend>
          {options.map((option) => (
            <label style={OPTION} key={option.value}>
              <input
                checked={answers.includes(option.value)}
                onChange={(event) => setAnswers((current) => (event.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value)))}
                type="checkbox"
              />
              {option.label}
            </label>
          ))}
          {needAnswer && <p className="admin-form__hint" role="alert">{t('admin.checklists.itemDetails.chooseAnswer', 'Choose at least one answer.')}</p>}
        </fieldset>
      )}
      {rule !== 'off' && (
        <label style={OPTION}>
          <input checked={required} onChange={(event) => setRequired(event.target.checked)} type="checkbox" />
          {t('admin.checklists.itemDetails.required', 'The explanation is required (the answer is not accepted without it)')}
        </label>
      )}
      <div className="ds-dialog__actions">
        <Button disabled={saving} onClick={onClose} type="button" variant="secondary">{t('admin.checklists.cancel', 'Cancel')}</Button>
        <Button disabled={saving || needAnswer} onClick={() => void save()} type="button" variant="primary">{t('admin.checklists.save', 'Save')}</Button>
      </div>
    </Dialog>
  );
}
