import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import { deleteChecklistCover, uploadChecklistCover } from '../../shared/api/checklists.js';
import { ChecklistCover } from '../../shared/ChecklistCover.js';
import { CHECKLIST_PHOTO_ACCEPT, CHECKLIST_PHOTO_MAX_MB, checklistPhotoErrorMessage, validateChecklistPhoto } from '../../shared/checklistPhoto.js';
import { Button } from '../../shared/ui.js';

/** PR 355: upload, replace and remove the cover in the builder. Own state keeps the builder's form state untouched. */
export function ChecklistCoverField({ checklistId, title, coverUpdatedAt }: {
  checklistId: string;
  title: string;
  coverUpdatedAt?: string | null;
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<string | null>(coverUpdatedAt ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setCurrent(coverUpdatedAt ?? null); }, [coverUpdatedAt]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const invalid = validateChecklistPhoto(file);
    if (invalid) {
      setError(checklistPhotoErrorMessage(invalid, t));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await uploadChecklistCover(checklistId, file);
      setCurrent(saved.coverUpdatedAt);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('admin.checklists.cover.uploadError', 'Unable to upload the cover.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteChecklistCover(checklistId);
      setCurrent(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('admin.checklists.cover.removeError', 'Unable to remove the cover.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="group" aria-labelledby="checklist-cover-title" style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
      <strong id="checklist-cover-title">{t('admin.checklists.cover.title', 'Checklist picture')}</strong>
      <ChecklistCover checklistId={checklistId} coverUpdatedAt={current} title={title} />
      <p className="admin-form__hint" style={{ margin: 0 }}>
        {t('admin.checklists.cover.hint', 'JPEG, PNG, GIF or WEBP, up to {{max}} MB. Without a picture a default illustration is shown.', { max: CHECKLIST_PHOTO_MAX_MB })}
      </p>
      <input ref={inputRef} type="file" accept={CHECKLIST_PHOTO_ACCEPT} onChange={(event) => void onFile(event)} hidden aria-label={t('admin.checklists.cover.file', 'Picture file')} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {current ? t('admin.checklists.cover.replace', 'Replace picture') : t('admin.checklists.cover.upload', 'Upload picture')}
        </Button>
        {current && (
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void remove()}>
            {t('admin.checklists.cover.remove', 'Remove picture')}
          </Button>
        )}
      </div>
      {error && <p role="alert" style={{ color: 'var(--color-danger, #dc2626)', margin: 0 }}>{error}</p>}
    </div>
  );
}
