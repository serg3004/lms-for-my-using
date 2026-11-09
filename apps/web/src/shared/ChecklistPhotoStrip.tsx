import { RichText, plainText } from './RichText.js';
import { useEffect, useId, useRef, useState, type CSSProperties, type HTMLAttributes, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { getChecklistPhotoBlob } from './api/checklists.js';
import type { ChecklistPhotoSummary } from './api/types.js';
import { useProtectedImage } from './useProtectedImage.js';
import { Dialog } from './ui.js';

/** React lets `cancel` (Esc on a native dialog) bubble up the component tree; this stops it at the strip. */
const cancelBarrier = { onCancel: (event: SyntheticEvent) => event.stopPropagation() } as HTMLAttributes<HTMLDivElement>;

/** PR 445: the large view fills a phone screen and is up to 96vw x 90vh elsewhere. */
const PHONE = '(max-width: 640px)';
const CHROME = 150; // padding, the close row, the gaps and the caption line around the picture, in px
function usePhone() {
  const query = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(PHONE) : null;
  const [phone, setPhone] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const list = query();
    if (!list) return;
    const update = () => setPhone(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);
  return phone;
}
/** The box of the large view: nearly the whole screen on a computer, the whole screen on a phone (safe areas kept). */
export function photoViewerBox(phone: boolean): CSSProperties {
  return phone
    ? { width: '100vw', maxWidth: 'none', height: '100dvh', maxHeight: 'none', margin: 0, borderRadius: 0, border: 0, boxSizing: 'border-box', overflow: 'auto',
        padding: 'max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px))' }
    : { width: 'min(96vw, 1200px)', maxWidth: 'none', maxHeight: '90vh', boxSizing: 'border-box', overflow: 'auto', padding: 16 };
}

/**
 * PR 421: one extra picture of a sheet. The file comes from the API and is shown through a `blob:` URL
 * (the page policy allows no images from the storage); `updatedAt` is the cache key. A failed load says so
 * and offers "Retry" instead of leaving an empty frame.
 */
export function ChecklistPhotoImage({ checklistId, photo, alt, fit = 'cover', maxHeight }: {
  checklistId: string;
  photo: ChecklistPhotoSummary;
  alt: string;
  fit?: 'cover' | 'contain';
  /** `contain` only: the tallest the picture may be (a CSS length). */
  maxHeight?: string;
}) {
  const { t } = useTranslation();
  const image = useProtectedImage(() => getChecklistPhotoBlob(checklistId, photo.id), `${checklistId}:${photo.id}:${photo.updatedAt}`);
  if (image.status === 'ready') {
    return fit === 'contain'
      ? <img src={image.url} alt={alt} style={{ display: 'block', maxWidth: '100%', maxHeight: maxHeight ?? '70vh', objectFit: 'contain', margin: '0 auto' }} />
      : <img src={image.url} alt={alt} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  if (image.status === 'error') {
    return (
      <div role="alert" style={{ display: 'grid', placeItems: 'center', alignContent: 'center', gap: 6, padding: 8, textAlign: 'center', width: '100%', height: '100%', fontSize: 12 }}>
        <span>{t('checklists.photos.loadError', 'Unable to show the image.')}</span>
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
  const phone = usePhone();
  const headingId = useId();
  const dialogHeadingId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const sorted = [...photos].sort((a, b) => a.order - b.order);
  const alt = (index: number) => {
    const photo = sorted[index]!;
    const base = t('checklists.photos.alt', 'Image {{n}} of the sheet “{{title}}”', { n: index + 1, title: plainText(title) });
    return photo.caption ? `${base}: ${plainText(photo.caption)}` : base;
  };
  const opened = openIndex === null ? null : sorted[openIndex] ?? null;

  const heading = t('checklists.photos.title', 'Checklist form image');
  const list = (
    <ul style={{ listStyle: 'none', margin: collapsible ? '8px 0 0' : 0, padding: 0, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))' }}>
      {sorted.map((photo, index) => (
        <li key={photo.id} style={{ minWidth: 0 }}>
          <button
            type="button"
            aria-label={t('checklists.photos.open', 'Open image {{n}} larger', { n: index + 1 })}
            onClick={() => setOpenIndex(index)}
            style={{ display: 'block', width: '100%', minHeight: 44, padding: 0, border: '1px solid var(--color-border, #d9deea)', borderRadius: 10, overflow: 'hidden', background: 'var(--color-surface-muted, #eef2ff)', cursor: 'zoom-in', aspectRatio: '4 / 3' }}
          >
            <ChecklistPhotoImage checklistId={checklistId} photo={photo} alt={alt(index)} />
          </button>
          {photo.caption && <RichText as="p" defaultAlign="center" value={photo.caption} style={{ margin: '4px 0 0', fontSize: 12.5 }} />}
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby={headingId} style={{ margin: '12px 0' }}>
      {collapsible ? (
        <details>
          {/* PR 445: the folded strip needs something to press; the full name stays for screen readers through the section label. */}
          <summary id={headingId} style={{ cursor: 'pointer', fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>{t('checklists.photos.collapsed', 'Images ({{n}})', { n: sorted.length })}</summary>
          {list}
        </details>
      ) : (
        <>
          {/* PR 445: the name is not shown to the user, screen readers still read it. */}
          <h3 id={headingId} className="ui-visually-hidden">{heading}</h3>
          {list}
        </>
      )}
      {/* A cancel (Esc) of the large view must not reach a dialog this strip sits in (the sheet preview). */}
      <div {...cancelBarrier}>
        <Dialog open={opened !== null} onClose={() => setOpenIndex(null)} labelledBy={dialogHeadingId} initialFocusRef={closeRef} style={photoViewerBox(phone)}>
          {opened && openIndex !== null && (
            <div data-testid="photo-viewer" style={{ display: 'grid', gap: 10, minWidth: 0, ...(phone ? { height: '100%', gridTemplateRows: 'auto minmax(0, 1fr) auto' } : {}) }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <h2 id={dialogHeadingId} className="ui-visually-hidden"><RichText value={opened.caption || t('checklists.photos.title', 'Checklist form image')} /></h2>
                <button ref={closeRef} className="ds-button ds-button--secondary ds-button--sm" style={{ minWidth: 44, minHeight: 44 }} type="button" onClick={() => setOpenIndex(null)}>
                  {t('checklists.photos.close', 'Close')}
                </button>
              </div>
              <div style={{ minHeight: 120, minWidth: 0, display: 'grid', placeItems: 'center' }}>
                <ChecklistPhotoImage checklistId={checklistId} photo={opened} alt={alt(openIndex)} fit="contain" maxHeight={phone ? `calc(100dvh - ${CHROME}px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))` : `calc(90vh - ${CHROME}px)`} />
              </div>
              {opened.caption && <RichText as="p" defaultAlign="center" value={opened.caption} style={{ margin: 0, maxHeight: '5em', overflowY: 'auto' }} />}
            </div>
          )}
        </Dialog>
      </div>
    </section>
  );
}
