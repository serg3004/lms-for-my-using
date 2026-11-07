import { RichTextField } from '../../shared/RichTextField.js';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, SortableContext, useFlatListDnd } from './ChecklistSortable.js';
import { useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { ApiClientError } from '../../shared/apiClient.js';
import {
  deleteChecklistPhoto,
  reorderChecklistPhotos,
  updateChecklistPhotoCaption,
  uploadChecklistPhoto,
} from '../../shared/api/checklists.js';
import type { ChecklistPhotoSummary } from '../../shared/api/types.js';
import { ChecklistPhotoImage } from '../../shared/ChecklistPhotoStrip.js';
import { CHECKLIST_PHOTO_ACCEPT, CHECKLIST_PHOTO_CAPTION_MAX_LENGTH, CHECKLIST_PHOTO_MAX_MB, MAX_CHECKLIST_PHOTOS, checklistPhotoErrorMessage, checklistUploadErrorMessage, isRetryableUploadError, validateChecklistPhoto } from '../../shared/checklistPhoto.js';
import { Button, ConfirmDialog } from '../../shared/ui.js';

const tapTarget: CSSProperties = { minWidth: 44, minHeight: 44 };

/** PR 421: one row of the list: handle, thumbnail, caption, arrows, remove. */
function PhotoRow({ checklistId, photo, index, count, title, disabled, onCaption, onMove, onRemove }: {
  checklistId: string; photo: ChecklistPhotoSummary; index: number; count: number; title: string; disabled: boolean;
  onCaption: (id: string, caption: string) => void; onMove: (from: number, to: number) => void; onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id, disabled });
  const [caption, setCaption] = useState(photo.caption);
  useEffect(() => { setCaption(photo.caption); }, [photo.caption]);
  const n = index + 1;
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform), transition,
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 8,
    border: '1px solid var(--color-border, #d9deea)', borderRadius: 10, background: 'var(--color-surface, #fff)',
    ...(isDragging ? { opacity: 0.6, position: 'relative', zIndex: 2, boxShadow: '0 4px 16px rgb(0 0 0 / .2)' } : {}),
  };
  return (
    <li ref={setNodeRef} style={style}>
      {!disabled && (
        <button ref={setActivatorNodeRef} className="admin-drag" type="button" aria-label={t('admin.checklists.photos.drag', 'Drag image {{n}}', { n })} {...attributes} {...listeners}>⋮⋮</button>
      )}
      <div style={{ width: 56, aspectRatio: '1 / 1', flex: 'none', borderRadius: 8, overflow: 'hidden', background: 'var(--color-surface-muted, #eef2ff)' }}>
        <ChecklistPhotoImage checklistId={checklistId} photo={photo} alt={t('admin.checklists.photos.alt', 'Image {{n}} of the sheet “{{title}}”', { n, title })} />
      </div>
      <div style={{ flex: '1 1 160px', minWidth: 0 }}><RichTextField value={caption} maxLength={CHECKLIST_PHOTO_CAPTION_MAX_LENGTH} disabled={disabled} singleLine compact
        label={t('admin.checklists.photos.caption', 'Caption of image {{n}}', { n })}
        onChange={setCaption} onBlur={() => { if (caption.trim() !== photo.caption) onCaption(photo.id, caption.trim()); }} /></div>
      {!disabled && (
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="ds-button ds-button--secondary ds-button--sm" style={tapTarget} type="button" disabled={index === 0} aria-label={t('admin.checklists.photos.up', 'Image {{n}} up', { n })} onClick={() => onMove(index, index - 1)}>↑</button>
          <button className="ds-button ds-button--secondary ds-button--sm" style={tapTarget} type="button" disabled={index === count - 1} aria-label={t('admin.checklists.photos.down', 'Image {{n}} down', { n })} onClick={() => onMove(index, index + 1)}>↓</button>
          <button className="ds-button ds-button--secondary ds-button--sm" style={tapTarget} type="button" aria-label={t('admin.checklists.photos.remove', 'Remove image {{n}}', { n })} onClick={() => onRemove(photo.id)}>×</button>
        </div>
      )}
    </li>
  );
}

/**
 * PR 421/433: "Checklist form image" -- the extra pictures of the sheet in the builder -- upload (up to 6), caption, order (arrows and drag),
 * remove with confirmation. Every change is saved at once, like the cover; own state keeps the builder's form untouched.
 */
export function ChecklistPhotosField({ checklistId, title, photos: initial, disabled = false, onChange }: {
  checklistId: string;
  title: string;
  photos?: readonly ChecklistPhotoSummary[];
  disabled?: boolean;
  /** The builder's preview shows the same list. */
  onChange?: (photos: ChecklistPhotoSummary[]) => void;
}) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<ChecklistPhotoSummary[]>(() => [...(initial ?? [])].sort((a, b) => a.order - b.order));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<string | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingId = `checklist-photos-title-${checklistId}`;

  function apply(next: ChecklistPhotoSummary[]) {
    setPhotos(next);
    onChange?.(next);
  }
  const fail = (err: unknown, fallback: string) => setError(err instanceof ApiClientError ? err.message : fallback);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const invalid = validateChecklistPhoto(file);
    if (invalid) { setError(checklistPhotoErrorMessage(invalid, t)); return; }
    await upload(file);
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setRetryFile(null);
    try {
      apply([...photos, await uploadChecklistPhoto(checklistId, file)]);
    } catch (err) {
      setError(checklistUploadErrorMessage(err, t('admin.checklists.photos.uploadError', 'Unable to upload the image.'), t));
      setRetryFile(isRetryableUploadError(err) ? file : null);
    } finally {
      setBusy(false);
    }
  }

  async function saveCaption(id: string, caption: string) {
    setError(null);
    try {
      const saved = await updateChecklistPhotoCaption(checklistId, id, caption);
      apply(photos.map((photo) => (photo.id === id ? saved : photo)));
    } catch (err) {
      fail(err, t('admin.checklists.photos.captionError', 'Unable to save the caption.'));
    }
  }

  async function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= photos.length) return;
    const before = photos;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    apply(next.map((photo, order) => ({ ...photo, order })));
    setError(null);
    try {
      await reorderChecklistPhotos(checklistId, next.map((photo) => photo.id));
    } catch (err) {
      apply(before);
      fail(err, t('admin.checklists.photos.moveError', 'Unable to change the order of the images.'));
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteChecklistPhoto(checklistId, id);
      apply(photos.filter((photo) => photo.id !== id).map((photo, order) => ({ ...photo, order })));
    } catch (err) {
      fail(err, t('admin.checklists.photos.removeError', 'Unable to remove the image.'));
    } finally {
      setBusy(false);
      setToRemove(null);
    }
  }

  const dnd = useFlatListDnd({
    ids: photos.map((photo) => photo.id),
    nameOf: (id) => t('admin.checklists.photos.caption', 'Caption of image {{n}}', { n: photos.findIndex((photo) => photo.id === id) + 1 }),
    onMove: (from, to) => void move(from, to),
    t,
  });
  const full = photos.length >= MAX_CHECKLIST_PHOTOS;
  const removeIndex = toRemove ? photos.findIndex((photo) => photo.id === toRemove) : -1;

  return (
    <div role="group" aria-labelledby={headingId} style={{ display: 'grid', gap: 8 }}>
      <strong id={headingId}>{t('admin.checklists.photos.title', 'Checklist form image')} <span className="admin-form__hint">({photos.length}/{MAX_CHECKLIST_PHOTOS})</span></strong>
      <p className="admin-form__hint" style={{ margin: 0 }}>
        {t('admin.checklists.photos.hint', 'Up to {{max}} images: JPEG, PNG, GIF or WEBP, up to {{maxMb}} MB each. The employee sees them on the sheet during the pass.', { max: MAX_CHECKLIST_PHOTOS, maxMb: CHECKLIST_PHOTO_MAX_MB })}
      </p>
      {photos.length === 0 ? (
        <p className="admin-form__hint" style={{ margin: 0, padding: '14px 12px', border: '1px dashed var(--color-border, #d9deea)', borderRadius: 10 }}>{t('admin.checklists.photos.empty', 'No images yet.')}</p>
      ) : (
        <DndContext {...dnd}>
          <SortableContext items={photos.map((photo) => photo.id)} strategy={verticalListSortingStrategy}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {photos.map((photo, index) => (
                <PhotoRow key={photo.id} checklistId={checklistId} photo={photo} index={index} count={photos.length} title={title} disabled={disabled || busy}
                  onCaption={(id, caption) => void saveCaption(id, caption)} onMove={(from, to) => void move(from, to)} onRemove={setToRemove} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <input ref={inputRef} type="file" accept={CHECKLIST_PHOTO_ACCEPT} onChange={(event) => void onFile(event)} hidden aria-label={t('admin.checklists.photos.file', 'Image file')} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button type="button" variant="secondary" size="sm" disabled={disabled || busy || full} onClick={() => inputRef.current?.click()} style={tapTarget}>
          {t('admin.checklists.photos.add', 'Add image')}
        </Button>
        {full && <span className="admin-form__hint">{t('admin.checklists.photos.full', 'The maximum of {{max}} images is uploaded.', { max: MAX_CHECKLIST_PHOTOS })}</span>}
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--color-danger, #dc2626)', margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span>{error}</span>
          {retryFile && <button type="button" className="admin-btn admin-btn--sm" disabled={busy} style={{ minHeight: 44 }} onClick={() => void upload(retryFile)}>{t('checklists.photoRetry', 'Retry')}</button>}
        </p>
      )}
      <ConfirmDialog
        open={toRemove !== null}
        title={t('admin.checklists.photos.removeTitle', 'Remove the image?')}
        message={t('admin.checklists.photos.removeMessage', 'Image {{n}} will disappear from the sheet. This cannot be undone.', { n: removeIndex + 1 })}
        confirmLabel={t('admin.checklists.photos.removeConfirm', 'Remove')}
        cancelLabel={t('admin.checklists.close', 'Close')}
        danger
        busy={busy}
        onConfirm={() => { if (toRemove) void remove(toRemove); }}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
