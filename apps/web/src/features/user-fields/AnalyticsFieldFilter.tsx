import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getUserFieldsForUsers, type UserFieldView } from '../../shared/api/userFields.js';
import { fieldLabel, languageOf, optionLabel, pickableOptions } from './model.js';

export function AnalyticsFieldFilter({ value, onChange, groupBy, onGroupBy }: {
  value?: string;
  onChange: (value: string) => void;
  groupBy?: string;
  onGroupBy?: (key: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [fields, setFields] = useState<UserFieldView[]>([]);
  const [draft, setDraft] = useState<{ source?: string; key: string; value: string }>();
  useEffect(() => {
    let active = true;
    void getUserFieldsForUsers().then(({ items }) => {
      if (active) setFields(items);
    }, () => {});
    return () => { active = false; };
  }, []);

  let saved: Array<[string, string]> = [];
  try {
    const parsed: unknown = value && JSON.parse(value);
    if (Array.isArray(parsed)) {
      saved = parsed.filter((entry): entry is [string, string] =>
        Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string');
    }
  } catch {
    // The server validates URL parameters. An invalid parameter can still be cleared here.
  }
  const active = new Map(saved);
  const current = draft && draft.source === value ? draft : { key: saved.at(-1)?.[0] ?? '', value: saved.at(-1)?.[1] ?? '' };
  const filterable = fields.filter((field) => field.type !== 'phone' && (field.type !== 'text' || field.searchable));
  const field = filterable.find((item) => item.key === current.key);
  if (!filterable.length && (!onGroupBy || !fields.length)) return null;
  const language = languageOf(i18n.language);
  const updateValue = (next: string) => setDraft({ source: value, key: current.key, value: next });

  return <fieldset style={{ gridColumn: '1 / -1', minWidth: 0, margin: 0, border: 0, padding: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12 }}>
    <legend style={{ fontWeight: 600, marginBottom: 6 }}>{t('userFields.title')}</legend>
    {filterable.length > 0 && <label style={{ display: 'grid', minWidth: 0, maxWidth: '100%', gap: 4 }}>
      {t('userFields.filterField')}
      <select className="ds-input" value={field?.key ?? ''} onChange={(event) => setDraft({ source: value, key: event.target.value, value: active.get(event.target.value) ?? '' })}>
        <option value="">{t('userFields.filterAny')}</option>
        {filterable.map((item) => <option key={item.key} value={item.key}>{fieldLabel(item, language)}{active.has(item.key) ? ' ✓' : ''}</option>)}
      </select>
    </label>}
    {field && <label style={{ display: 'grid', minWidth: 0, maxWidth: '100%', gap: 4 }}>
      {t('userFields.filterValue')}
      {field.type === 'boolean' || field.type === 'list'
        ? <select className="ds-input" value={current.value} onChange={(event) => updateValue(event.target.value)}>
          <option value="">{t('userFields.noValue')}</option>
          {field.type === 'boolean'
            ? <><option value="true">{t('userFields.yes')}</option><option value="false">{t('userFields.no')}</option></>
            : pickableOptions(field, current.value).map((option) => <option key={option.key} value={option.key}>{optionLabel(option, language)}</option>)}
        </select>
        : <input className="ds-input" type={field.type} step={field.type === 'number' ? 'any' : undefined} maxLength={500} value={current.value} onChange={(event) => updateValue(event.target.value)} />}
    </label>}
    {field && <button className="ds-button" type="button" disabled={!current.value.trim() || (active.size >= 10 && !active.has(current.key))} onClick={() => {
      active.set(current.key, current.value.trim());
      onChange(JSON.stringify([...active]));
    }}>
      {t('userFields.applyFilter')}
    </button>}
    {value && <button className="ds-button" type="button" onClick={() => { setDraft(undefined); onChange(''); }}>{t('userFields.clearFilter')}</button>}
    {onGroupBy && <label style={{ display: 'grid', minWidth: 0, maxWidth: '100%', gap: 4 }}>
      {t('userFields.groupBy')}
      <select className="ds-input" value={fields.some((item) => item.key === groupBy) ? groupBy : ''} onChange={(event) => onGroupBy(event.target.value)}>
        <option value="">{t('userFields.noValue')}</option>
        {fields.map((item) => <option key={item.key} value={item.key}>{fieldLabel(item, language)}</option>)}
      </select>
    </label>}
  </fieldset>;
}
