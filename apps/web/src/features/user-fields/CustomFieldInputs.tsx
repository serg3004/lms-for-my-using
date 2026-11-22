import { useTranslation } from 'react-i18next';

import { FormField } from '../../shared/adminPage.js';
import type { UserFieldView } from '../../shared/api/userFields.js';
import { fieldLabel, isEditable, languageOf, optionLabel, pickableOptions, type FormValues } from './model.js';

type Props = {
  fields: UserFieldView[]; values: FormValues; onChange: (key: string, value: string) => void; idPrefix: string;
  /** Show the fields the caller may not change as read-only values (the user form) or leave them out. */
  showReadOnly?: boolean;
};

/** PR 500: one input per custom field, by type; a field the caller may not change is shown disabled. */
export function CustomFieldInputs({ fields, values, onChange, idPrefix, showReadOnly = true }: Props) {
  const { t, i18n } = useTranslation();
  const language = languageOf(i18n.language);
  const shown = fields.filter((field) => showReadOnly || isEditable(field));
  if (shown.length === 0) return null;
  return <>
    {shown.map((field) => {
      const id = `${idPrefix}-${field.key}`;
      const value = values[field.key] ?? '';
      const disabled = !isEditable(field);
      const label = fieldLabel(field, language);
      const set = (next: string) => onChange(field.key, next);
      let input;
      if (field.type === 'list') {
        input = <select id={id} disabled={disabled} value={value} onChange={(event) => set(event.target.value)}>
          <option value="">{t('userFields.noValue')}</option>
          {pickableOptions(field, value).map((option) => <option key={option.key} value={option.key}>{optionLabel(option, language)}</option>)}
        </select>;
      } else if (field.type === 'boolean') {
        input = <select id={id} disabled={disabled} value={value} onChange={(event) => set(event.target.value)}>
          <option value="">{t('userFields.noValue')}</option><option value="true">{t('userFields.yes')}</option><option value="false">{t('userFields.no')}</option>
        </select>;
      } else {
        input = <input id={id} disabled={disabled} value={value} onChange={(event) => set(event.target.value)}
          type={field.type === 'date' ? 'date' : field.type === 'phone' ? 'tel' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} />;
      }
      return <FormField key={field.key} id={id} label={label} required={field.required && !disabled} {...(disabled ? { hint: t('userFields.readOnlyHint') } : {})}>{input}</FormField>;
    })}
  </>;
}
