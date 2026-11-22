import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { FormField } from '../../shared/adminPage.js';
import { FIELD_LANGUAGES, type FieldViewer } from '../../shared/api/userFields.js';
import { FIELD_TYPES, TYPES_WITH_SEARCH } from './model.js';
import { hasEditorErrors, suggestKey, toInput, validateEditor, type EditorErrors, type EditorState } from './editorModel.js';
import type { UserFieldInput } from '../../shared/api/userFields.js';

type Props = { initial: EditorState | null; takenKeys: ReadonlySet<string>; saving: boolean; error: string | null; onSave: (input: UserFieldInput, mode: 'create' | 'edit') => void; onClose: () => void };

const row = { display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))' } as const;

/** PR 500: create or change one custom user field: titles in four languages, type, list values, flags and who sees and edits it. */
export function UserFieldDialog({ initial, takenKeys, saving, error, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, setState] = useState<EditorState | null>(initial);
  const [errors, setErrors] = useState<EditorErrors>({});
  const [keyTouched, setKeyTouched] = useState(false);

  useEffect(() => { setState(initial); setErrors({}); setKeyTouched(false); }, [initial]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (initial && dialog && !dialog.open) dialog.showModal();
    else if (!initial && dialog?.open) dialog.close();
  }, [initial]);
  if (!initial || !state) return <dialog ref={dialogRef} />;

  const edit = state.mode === 'edit';
  const patch = (next: Partial<EditorState>) => setState({ ...state, ...next });
  const setLabel = (language: (typeof FIELD_LANGUAGES)[number], value: string) => {
    const labels = { ...state.labels, [language]: value };
    // A new field gets its key from the English (or first) title until the administrator types their own.
    patch({ labels, ...(!edit && !keyTouched ? { key: suggestKey(labels.en.trim() || labels.ru.trim() || value, takenKeys) } : {}) });
  };
  const setOption = (index: number, change: Partial<EditorState['options'][number]>) => patch({ options: state.options.map((option, at) => (at === index ? { ...option, ...change } : option)) });
  const addOption = () => patch({ options: [...state.options, { key: '', labels: { ru: '', en: '', kk: '', zh: '' }, archived: false, saved: false }] });
  const setOptionLabel = (index: number, language: (typeof FIELD_LANGUAGES)[number], value: string) => {
    const option = state.options[index]!;
    const labels = { ...option.labels, [language]: value };
    const taken = new Set(state.options.filter((_, at) => at !== index).map((item) => item.key));
    setOption(index, { labels, ...(option.saved ? {} : { key: suggestKey(labels.en.trim() || labels.ru.trim() || value, taken, 'option') }) });
  };
  const setRight = (kind: 'visible' | 'editable', viewer: FieldViewer, value: boolean) => patch({ [kind]: { ...state[kind], [viewer]: value } } as Partial<EditorState>);

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateEditor(state!);
    setErrors(found);
    if (!hasEditorErrors(found)) onSave(toInput(state!), state!.mode);
  }
  const searchFits = TYPES_WITH_SEARCH.includes(state.type);

  return <dialog aria-labelledby={titleId} className="admin-dialog admin-user-dialog" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={() => { if (initial) onClose(); }}>
    <div className="admin-dialog__header"><h2 id={titleId}>{edit ? t('userFields.editTitle') : t('userFields.createTitle')}</h2><button aria-label={t('userFields.close')} className="admin-dialog__close" onClick={onClose} type="button">✕</button></div>
    <form className="admin-form" onSubmit={submit}>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        <legend>{t('userFields.titles')}</legend>
        <div style={row}>
          {FIELD_LANGUAGES.map((language) => <FormField key={language} id={`field-label-${language}`} label={t(`userFields.language.${language}`)} required={language === 'ru'}>
            <input id={`field-label-${language}`} aria-invalid={Boolean(errors.labels) && language === 'ru'} maxLength={80} value={state.labels[language]} onChange={(event) => setLabel(language, event.target.value)} />
          </FormField>)}
        </div>
        {errors.labels ? <p className="admin-form__field-error" role="alert">{t('userFields.errors.labels')}</p> : <span className="admin-form__hint">{t('userFields.titlesHint')}</span>}
      </fieldset>
      <div style={row}>
        <FormField id="field-key" label={t('userFields.key')} required hint={t('userFields.keyHint')} {...(errors.key ? { error: t('userFields.errors.key') } : {})}>
          <input id="field-key" disabled={edit} maxLength={40} value={state.key} onChange={(event) => { setKeyTouched(true); patch({ key: event.target.value.toLowerCase() }); }} />
        </FormField>
        <FormField id="field-type" label={t('userFields.type')} hint={edit ? t('userFields.typeLocked') : undefined}>
          <select id="field-type" disabled={edit} value={state.type} onChange={(event) => patch({ type: event.target.value as EditorState['type'], options: [] })}>
            {FIELD_TYPES.map((type) => <option key={type} value={type}>{t(`userFields.types.${type}`)}</option>)}
          </select>
        </FormField>
      </div>
      {state.type === 'list' ? <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        <legend>{t('userFields.options')}</legend>
        {state.options.map((option, index) => <div key={index} style={{ display: 'grid', gap: '0.25rem' }}>
          <div style={row}>
            {FIELD_LANGUAGES.map((language) => <input key={language} aria-label={`${t('userFields.optionTitle', { number: index + 1 })} ${t(`userFields.language.${language}`)}`} placeholder={t(`userFields.language.${language}`)} maxLength={80} value={option.labels[language]} onChange={(event) => setOptionLabel(index, language, event.target.value)} />)}
          </div>
          <div className="td-actions">
            <code>{option.key || '—'}</code>
            {option.saved ? <label><input type="checkbox" checked={option.archived} onChange={(event) => setOption(index, { archived: event.target.checked })} /> {t('userFields.optionArchived')}</label>
              : <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => patch({ options: state.options.filter((_, at) => at !== index) })}>{t('userFields.optionRemove')}</button>}
          </div>
        </div>)}
        <div><button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={addOption}>{t('userFields.optionAdd')}</button></div>
        {errors.options ? <p className="admin-form__field-error" role="alert">{t(`userFields.errors.${errors.options}`)}</p> : <span className="admin-form__hint">{t('userFields.optionsHint')}</span>}
      </fieldset> : null}
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.25rem' }}>
        <legend>{t('userFields.rules')}</legend>
        <label><input type="checkbox" checked={state.required} onChange={(event) => patch({ required: event.target.checked })} /> {t('userFields.required')}</label>
        <label><input type="checkbox" disabled={!searchFits} checked={searchFits && state.unique} onChange={(event) => patch({ unique: event.target.checked })} /> {t('userFields.unique')}</label>
        <label><input type="checkbox" disabled={!searchFits} checked={searchFits && state.searchable} onChange={(event) => patch({ searchable: event.target.checked })} /> {t('userFields.searchable')}</label>
        {!searchFits ? <span className="admin-form__hint">{t('userFields.searchNote')}</span> : null}
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.25rem' }}>
        <legend>{t('userFields.access')}</legend>
        <span className="admin-form__hint">{t('userFields.accessHint')}</span>
        {(['manager', 'self'] as const).map((viewer) => <div key={viewer} className="td-actions">
          <label><input type="checkbox" checked={state.visible[viewer]} onChange={(event) => setRight('visible', viewer, event.target.checked)} /> {t(`userFields.sees.${viewer}`)}</label>
          <label><input type="checkbox" disabled={!state.visible[viewer]} checked={state.visible[viewer] && state.editable[viewer]} onChange={(event) => setRight('editable', viewer, event.target.checked)} /> {t(`userFields.edits.${viewer}`)}</label>
        </div>)}
      </fieldset>
      {error ? <p className="admin-form__error" role="alert">{error}</p> : null}
      <div className="admin-form__actions"><button className="admin-btn admin-btn--secondary" onClick={onClose} type="button">{t('admin.users.cancel', 'Cancel')}</button><button className="admin-btn admin-btn--primary" disabled={saving} type="submit">{saving ? t('admin.users.saving', 'Saving...') : t('admin.users.save', 'Save')}</button></div>
    </form>
  </dialog>;
}
