import type { TFunction } from 'i18next';

import type { MaterialKind } from './model.js';

export function MaterialMetadataForm({ form, onChange, t, titleError }: {
  form: { title: string; kind: MaterialKind };
  onChange: (field: 'title' | 'kind', value: string) => void;
  t: TFunction;
  titleError?: string;
}) {
  return <>
    <div className="admin-form__field">
      <label>{t('admin.materials.materialTitle', 'Title')}</label>
      <input value={form.title} onChange={(event) => onChange('title', event.target.value)} maxLength={160} />
      {titleError ? <p className="admin-form__error" role="alert">{titleError}</p> : null}
    </div>
    <div className="admin-form__field">
      <label>{t('admin.materials.kind', 'Kind')}</label>
      <select value={form.kind} onChange={(event) => onChange('kind', event.target.value)}>
        <option value="link">{t('admin.materials.link', 'Link (URL)')}</option>
        <option value="file">{t('admin.materials.file', 'File (upload)')}</option>
      </select>
    </div>
  </>;
}
