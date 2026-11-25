import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { apiDownloadRequest, apiRequest } from '../../shared/apiClient.js';

type JobStatus = { state: 'pending' | 'failed' | 'completed'; downloadUrl?: string };

function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function AssessmentExportControls({ path, query, hasFolder }: { path: string; query: string; hasFolder: boolean }) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState('results');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [job, setJob] = useState<string>();
  const [ready, setReady] = useState<string>();

  useEffect(() => {
    if (!job) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await apiRequest<JobStatus>(job!, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (result.state === 'pending') {
          timer = setTimeout(() => void poll(), 2_000);
          return;
        }
        setReady(result.downloadUrl);
        setError(result.state === 'failed');
        setJob(undefined);
      } catch {
        if (!controller.signal.aborted) {
          setError(true);
          setJob(undefined);
        }
      }
    }
    timer = setTimeout(() => void poll(), 2_000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [job]);

  async function start(format: 'xlsx' | 'pdf') {
    setBusy(true);
    setError(false);
    setReady(undefined);
    try {
      const language = (i18n.resolvedLanguage ?? 'en').split('-')[0]!;
      const locale = ['ru', 'kk', 'zh'].includes(language) ? language : 'en';
      const filters = new URLSearchParams(query);
      filters.delete('page');
      const file = await apiDownloadRequest(path, undefined, {
        method: 'POST',
        body: JSON.stringify({ view, format, locale, filters: Object.fromEntries(filters) }),
      });
      if (file.blob.type.startsWith('application/json')) {
        const { statusUrl } = JSON.parse(await file.blob.text()) as { statusUrl: string };
        setJob(statusUrl);
      } else {
        saveFile(file.blob, file.filename ?? `assessment.${format}`);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function download(url: string) {
    setBusy(true);
    setError(false);
    try {
      const { blob, filename } = await apiDownloadRequest(url);
      saveFile(blob, filename ?? 'assessment');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
    <label>{t('assessmentExport.label')}{' '}
      <select className="ds-input" value={view} disabled={busy || Boolean(job)} onChange={(event) => setView(event.target.value)}>
        <option value="results">{t('assessmentExport.results')}</option>
        <option value="questions">{t('assessmentExport.questions')}</option>
        {hasFolder && <option value="folder">{t('assessmentExport.folder')}</option>}
      </select>
    </label>
    {(['xlsx', 'pdf'] as const).map((format) => <button key={format} className="ds-button ds-button--secondary"
      type="button" disabled={busy || Boolean(job)} onClick={() => void start(format)}
      aria-label={t('assessmentExport.download', { format: format.toUpperCase() })}>{format.toUpperCase()}</button>)}
    {(busy || job) && <span role="status">{t('assessmentExport.pending')}</span>}
    {ready && <button type="button" className="ds-button ds-button--text" disabled={busy} onClick={() => void download(ready)}>
      {t('assessmentExport.ready')}
    </button>}
    {error && <span role="alert">{t('assessmentExport.error')}</span>}
  </div>;
}
