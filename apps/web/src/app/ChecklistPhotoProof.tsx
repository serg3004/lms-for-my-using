import { useId, useState } from 'react';
import type { TFunction } from 'i18next';
import { getChecklistItemPhotoBlob } from '../shared/api/checklists.js';
import { Button, Dialog } from '../shared/ui.js';
import { useProtectedImage } from '../shared/useProtectedImage.js';

type Props = {
  instanceId: string;
  itemId: string;
  fileName: string;
  /** The photo may be replaced or removed (the sheet is still open and nothing is saving). */
  canChange: boolean;
  onReplace: () => void;
  onRemove: () => void;
  t: TFunction;
};

/**
 * PR 406а: an attached photo is shown as a mark with the file name and three actions instead of a
 * thumbnail: view (opens the picture in a dialog), replace and remove. The picture is fetched only
 * while the dialog is open, with the session, through a `blob:` URL (see `useProtectedImage`).
 */
export function ChecklistPhotoProof({ instanceId, itemId, fileName, canChange, onReplace, onRemove, t }: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const image = useProtectedImage(open ? () => getChecklistItemPhotoBlob(instanceId, itemId) : null, open ? `${instanceId}:${itemId}:${fileName}` : null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span aria-hidden="true" style={{ color: 'var(--color-success, #16a34a)', fontWeight: 700 }}>✓</span>
      <span style={{ fontSize: 13 }}>
        <strong>{t('checklists.photoAttached', 'Photo attached')}</strong>{' '}
        <span style={{ color: 'var(--color-text-muted, #64748b)', overflowWrap: 'anywhere' }}>{fileName}</span>
      </span>
      <Button type="button" size="sm" variant="secondary" style={{ minHeight: 44 }} onClick={() => setOpen(true)}>{t('checklists.photoView', 'View photo')}</Button>
      {canChange && <Button type="button" size="sm" variant="secondary" style={{ minHeight: 44 }} onClick={onReplace}>{t('checklists.photoReplace', 'Replace')}</Button>}
      {canChange && <Button type="button" size="sm" variant="ghost" style={{ minHeight: 44 }} onClick={onRemove}>{t('checklists.photoRemove', 'Remove')}</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <h2 id={titleId}>{t('checklists.photoViewTitle', 'Criterion photo')}</h2>
        {image.status === 'loading' && <p role="status">…</p>}
        {image.status === 'error' && (
          <p role="alert">
            {t('checklists.photoLoadError', 'Could not show the photo')}{' '}
            <Button type="button" size="sm" variant="secondary" onClick={image.retry}>{t('checklists.photoRetry', 'Retry')}</Button>
          </p>
        )}
        {image.status === 'ready' && <img src={image.url} alt={fileName} style={{ maxWidth: 'min(80vw, 720px)', maxHeight: '70vh', objectFit: 'contain' }} />}
        <div className="ds-dialog__actions">
          <Button type="button" onClick={() => setOpen(false)}>{t('checklists.photoClose', 'Close')}</Button>
        </div>
      </Dialog>
    </div>
  );
}
