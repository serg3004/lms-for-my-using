import { useId } from 'react';
import type { TFunction } from 'i18next';
import { FormField } from '../../shared/adminPage.js';
import type { MaterialKind } from './model.js';

export function MaterialMetadataForm({ form, onChange, t, titleError }: {
  form: { title: string; kind: MaterialKind };
  onChange: (field: 'title' | 'kind', value: string) => void;
  t: TFunction;
  titleError?: string;
}) {
  const uid = useId();
  return (
    <>
      <FormField id={`${uid}-title`} label={t('admin.materials.materialTitle', 'Title')} required error={titleError}>
        <input
          id={`${uid}-title`}
          aria-describedby={titleError ? `${uid}-title-error` : undefined}
          aria-invalid={Boolean(titleError)}
          value={form.title}
          onChange={(event) => onChange('title', event.target.value)}
          maxLength={160}
        />
      </FormField>
      <FormField id={`${uid}-kind`} label={t('admin.materials.kind', 'Kind')}>
        <select id={`${uid}-kind`} value={form.kind} onChange={(event) => onChange('kind', event.target.value)}>
          <option value="link">{t('admin.materials.link', 'Link (URL)')}</option>
          <option value="file">{t('admin.materials.file', 'File (upload)')}</option>
        </select>
      </FormField>
    </>
  );
}
