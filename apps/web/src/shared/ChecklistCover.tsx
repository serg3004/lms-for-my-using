import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getChecklistCoverBlob } from './api/checklists.js';
import { useProtectedImage } from './useProtectedImage.js';

/**
 * PR 355: the cover of a checklist. Without a cover, or when the file cannot be fetched or the image
 * fails to load, a default illustration is shown so the layout never shifts or breaks.
 * PR 400: the file comes from the API and is shown through a `blob:` URL (the page policy does not
 * allow images from the storage). `coverUpdatedAt` is also the cache key: a replaced cover is fetched
 * again. With `retryable` (the editor) a failure says so and offers "Retry" instead of a silent placeholder.
 */
export function ChecklistCover({ checklistId, coverUpdatedAt, title, ratio = '16 / 9', retryable = false }: {
  checklistId: string;
  coverUpdatedAt?: string | null;
  title: string;
  ratio?: string;
  retryable?: boolean;
}) {
  const { t } = useTranslation();
  const image = useProtectedImage(coverUpdatedAt ? () => getChecklistCoverBlob(checklistId) : null, coverUpdatedAt ? `${checklistId}:${coverUpdatedAt}` : null);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const url = image.status === 'ready' && image.url !== brokenUrl ? image.url : null;
  const failed = image.status === 'error' || (image.status === 'ready' && image.url === brokenUrl);

  const frame = { width: '100%', aspectRatio: ratio, borderRadius: 10, overflow: 'hidden', background: 'var(--color-surface-muted, #eef2ff)' } as const;
  if (url) {
    return (
      <div style={frame}>
        <img
          src={url}
          alt={t('checklists.cover.alt', 'Cover of the checklist “{{title}}”', { title })}
          onError={() => setBrokenUrl(url)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }
  if (retryable && failed) {
    return (
      <div role="alert" style={{ ...frame, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 8, padding: 12, textAlign: 'center' }}>
        <span>{t('checklists.cover.loadError', 'Unable to show the picture.')}</span>
        <button className="ds-button ds-button--secondary ds-button--sm" onClick={() => { setBrokenUrl(null); image.retry(); }} type="button">
          {t('checklists.cover.retry', 'Retry')}
        </button>
      </div>
    );
  }
  return (
    <div style={{ ...frame, display: 'grid', placeItems: 'center' }}>
      <svg role="img" aria-label={t('checklists.cover.defaultAlt', 'Default checklist illustration')} viewBox="0 0 64 64" width="40%" style={{ maxWidth: 72, color: 'var(--color-primary, #4f46e5)' }}>
        <rect x="14" y="8" width="36" height="48" rx="6" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M22 24l4 4 7-8M22 40l4 4 7-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M38 26h6M38 42h6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}
