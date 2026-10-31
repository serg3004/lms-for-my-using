import { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLongreadFile, getLongreadFileUrl, type LongreadImage } from '../../shared/api/longreads.js';

export const LongreadMediaContext = createContext<{ lessonId: string; version: number | null } | null>(null);
export function MediaImage({ image }: { image: LongreadImage }) {
  const source = useContext(LongreadMediaContext), { t } = useTranslation();
  const [url, setUrl] = useState(''), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const fileId = image.fileId, lessonId = source?.lessonId, version = source?.version;
  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent<{ lessonId: string }>).detail?.lessonId === lessonId) setRetry((n) => n + 1); };
    window.addEventListener('longread-files-updated', changed);
    return () => window.removeEventListener('longread-files-updated', changed);
  }, [lessonId]);
  useEffect(() => {
    setUrl(''); setError(false);
    if (!fileId || !lessonId || version === undefined) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined, tries = 0;
    async function load() {
      try {
        const result = await getLongreadFileUrl(lessonId!, fileId!, version!, controller.signal);
        if (!controller.signal.aborted) { setUrl(result.url); setError(false); timer = setTimeout(() => void load(), Math.max(1, result.expiresIn - 10) * 1000); }
      } catch {
        if (controller.signal.aborted) return;
        if (version === null && tries++ < 40) {
          try {
            const file = await getLongreadFile(lessonId!, fileId!, controller.signal);
            if (file.scanStatus === 'pending' || file.scanStatus === 'scanning' || file.scanStatus === null) { timer = setTimeout(() => void load(), 10000); return; }
          } catch { /* A missing/foreign file remains unavailable. */ }
        }
        if (!controller.signal.aborted) { setUrl(''); setError(true); }
      }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [fileId, lessonId, version, retry]);
  if (!fileId) return <p>{t('longreadFiles.noImage')}</p>;
  return <figure style={{ width: `${image.width}%`, maxWidth: '100%', marginBlock: 16, marginInlineStart: image.align === 'start' ? 0 : 'auto', marginInlineEnd: image.align === 'end' ? 0 : 'auto', overflowWrap: 'anywhere' }}>
    {url ? <img src={url} alt={image.alt} loading="lazy" style={{ display: 'block', width: '100%', maxWidth: '100%', height: 'auto' }} onError={() => { setUrl(''); setError(true); }} />
      : <p role="status">{t(error ? 'longreadFiles.unavailable' : 'longreadFiles.checking')}{error && <button type="button" className="admin-btn admin-btn--secondary" style={{ minHeight: 44 }} onClick={() => setRetry((n) => n + 1)}>{t('longread.retry')}</button>}</p>}
    {image.caption && <figcaption>{image.caption}</figcaption>}
  </figure>;
}
export function MediaAttachment({ fileId, label }: { fileId: string; label?: string }) {
  const source = useContext(LongreadMediaContext), { t } = useTranslation(); const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  return <div style={{ overflowWrap: 'anywhere', marginBlock: 8 }}>
    <button type="button" className="admin-btn admin-btn--secondary" style={{ minHeight: 44, maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'start' }} disabled={busy || !source} onClick={() => {
      if (!source) return; setBusy(true); setError(false);
      void getLongreadFileUrl(source.lessonId, fileId, source.version).then((result) => {
        const anchor = document.createElement('a'); anchor.href = result.url; anchor.rel = 'noopener noreferrer'; anchor.download = result.fileName; document.body.append(anchor); anchor.click(); anchor.remove();
      }).catch(() => setError(true)).finally(() => setBusy(false));
    }}>{busy ? t('longreadFiles.checking') : t('longreadFiles.download', { name: label || t('longreadFiles.file') })}</button>
    {error && <p role="alert">{t('longreadFiles.unavailable')}</p>}
  </div>;
}
