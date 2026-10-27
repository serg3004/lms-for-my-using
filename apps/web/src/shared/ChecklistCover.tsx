import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getChecklistCoverUrl } from './api/checklists.js';

/**
 * PR 355: the cover of a checklist. Without a cover, or when the signed URL cannot be fetched or the
 * image fails to load, a default illustration is shown so the layout never shifts or breaks.
 * `coverUpdatedAt` is also the cache key: a replaced cover is fetched again.
 */
export function ChecklistCover({ checklistId, coverUpdatedAt, title, ratio = '16 / 9' }: {
  checklistId: string;
  coverUpdatedAt?: string | null;
  title: string;
  ratio?: string;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!coverUpdatedAt) return undefined;
    let cancelled = false;
    getChecklistCoverUrl(checklistId)
      .then((result) => { if (!cancelled) setUrl(result.url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [checklistId, coverUpdatedAt]);

  const frame = { width: '100%', aspectRatio: ratio, borderRadius: 10, overflow: 'hidden', background: 'var(--color-surface-muted, #eef2ff)' } as const;
  if (url && !failed) {
    return (
      <div style={frame}>
        <img
          src={url}
          alt={t('checklists.cover.alt', 'Cover of the checklist “{{title}}”', { title })}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
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
