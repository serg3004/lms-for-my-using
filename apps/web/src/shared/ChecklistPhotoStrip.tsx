import { useId, useRef, useState, type HTMLAttributes, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { getChecklistPhotoBlob } from './api/checklists.js';
import type { ChecklistPhotoSummary } from './api/types.js';
import { useProtectedImage } from './useProtectedImage.js';
import { Dialog } from './ui.js';

/** React lets `cancel` (Esc on a native dialog) bubble up the component tree; this stops it at the strip. */
const cancelBarrier = { onCancel: (event: SyntheticEvent) => event.stopPropagation() } as HTMLAttributes<HTMLDivElement>;

/**
 * PR 421: one extra picture of a sheet. The file comes from the API and is shown through a `blob:` URL
 * (the page policy allows no images from the storage); `updatedAt` is the cache key. A failed load says so
 * and offers "Retry" instead of leaving an empty frame.
 */
export function ChecklistPhotoImage({ checklistId, photo, alt, fit = 'cover' }: {
  checklistId: string;
  photo: ChecklistPhotoSummary;
  alt: string;
  fit?: 'cover' | 'contain';
}) {
  const { t } = useTranslation();
  const image = useProtectedImage(() => getChecklistPhotoBlob(checklistId, photo.id), `${checklistId}:${photo.id}:${photo.updatedAt}`);
  if (image.status === 'ready') {
    return fit === 'contain'
      ? <img src={image.url} alt={alt} style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', margin: '0 auto' }} />
      : <img src={image.url} alt={alt} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  if (image.status === 'error') {
    return (
      <div role="alert" style={{ display: 'grid', placeItems: 'center', alignContent: 'center', gap: 6, padding: 8, textAlign: 'center', width: '100%', height: '100%', fontSize: 12 }}>
        <span>{t('checklists.photos.loadError', 'Unable to show the photo.')}</span>
        <button className="ds-button ds-button--secondary ds-button--sm" type="button" onClick={image.retry}>{t('checklists.photos.retry', 'Retry')}</button>
      </div>
    );
  }
  return <div aria-hidden="true" style={{ width: '100%', height: '100%' }} />;
}

/**
 * PR 421: "Sheet photos" -- the extra pictures of a sheet as a strip of thumbnails; a tap opens one large
 * with its caption (Esc or "Close" returns). Shown in the preview and during the pass; renders nothing without photos.
 */
export function ChecklistPhotoStrip({ checklistId, photos, title, collapsible = false }: { checklistId: string; photos: readonly ChecklistPhotoSummary[]; title: string; /** On a small screen of the pass the strip is folded to one line so it does not push the criteria down. */ collapsible?: boolean }) {
  const { t } = useTranslation();
  const headingId = useId();
  const dialogHeadingId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const sorted = [...photos].sort((a, b) => a.order - b.order);
  const alt = (index: number) => {
    const photo = sorted[index]!;
    const base = t('checklists.photos.alt', 'Photo {{n}} of the sheet “{{title}}”', { n: index + 1, title });
    return photo.caption ? `${base}: ${photo.caption}` : base;
  };
  const opened = openIndex === null ? null : sorted[openIndex] ?? null;

  const heading = t('checklists.photos.title', 'Sheet photos');
  const list = (
    <ul style={{ listStyle: 'none', margin: collapsible ? '8px 0 0' : 0, padding: 0, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))' }}>
      {sorted.map((photo, index) => (
        <li key={photo.id} style={{ minWidth: 0 }}>
          <button
            type="button"
            aria-label={t('checklists.photos.open', 'Open photo {{n}} larger', { n: index + 1 })}
            onClick={() => setOpenIndex(index)}
            style={{ display: 'block', width: '100%', minHeight: 44, padding: 0, border: '1px solid var(--color-border, #d9deea)', borderRadius: 10, overflow: 'hidden', background: 'var(--color-surface-muted, #eef2ff)', cursor: 'zoom-in', aspectRatio: '4 / 3' }}
          >
            <ChecklistPhotoImage checklistId={checklistId} photo={photo} alt={alt(index)} />
          </button>
          {photo.caption && <p style={{ margin: '4px 0 0', fontSize: 12.5, overflowWrap: 'anywhere' }}>{photo.caption}</p>}
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby={headingId} style={{ margin: '12px 0' }}>
      {collapsible ? (
        <details>
          <summary id={headingId} style={{ cursor: 'pointer', fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>{heading} ({sorted.length})</summary>
          {list}
        </details>
      ) : (
        <>
          <h3 id={headingId} style={{ margin: '0 0 8px' }}>{heading}</h3>
          {list}
        </>
      )}
      {/* A cancel (Esc) of the large view must not reach a dialog this strip sits in (the sheet preview). */}
      <div {...cancelBarrier}>
        <Dialog open={opened !== null} onClose={() => setOpenIndex(null)} labelledBy={dialogHeadingId} initialFocusRef={closeRef}>
          {opened && openIndex !== null && (
            <div style={{ display: 'grid', gap: 10, width: 'min(92vw, 720px)', maxWidth: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <h2 id={dialogHeadingId} style={{ margin: 0, fontSize: 16, minWidth: 0, overflowWrap: 'anywhere' }}>{opened.caption || t('checklists.photos.title', 'Sheet photos')}</h2>
                <button ref={closeRef} className="ds-button ds-button--secondary ds-button--sm" style={{ minWidth: 44, minHeight: 44 }} type="button" onClick={() => setOpenIndex(null)}>
                  {t('checklists.photos.close', 'Close')}
                </button>
              </div>
              <div style={{ minHeight: 120 }}>
                <ChecklistPhotoImage checklistId={checklistId} photo={opened} alt={alt(openIndex)} fit="contain" />
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </section>
  );
}
