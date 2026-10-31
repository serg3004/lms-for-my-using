import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createLongreadFiles, getLongreadFile, type LongreadFile, type LongreadImage } from '../../shared/api/longreads.js';
import { uploadMaterialFileWithProgress } from '../../shared/apiClient.js';
import { acceptFiles, prepareFiles, isAttachmentsContent } from './model.js';
import { LongreadMediaContext, MediaImage } from './Media.js';

export const emptyImage = (): LongreadImage => ({ fileId: null, alt: '', caption: '', width: 100, align: 'center' });
function UploadPicker({ lessonId, image, onCreated }: { lessonId: string; image: boolean; onCreated: (files: LongreadFile[]) => void }) {
  const createdCallback = useRef(onCreated); createdCallback.current = onCreated;
  const { t } = useTranslation(); const id = useId(); const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  return <div style={{ marginBlock: 12, minWidth: 0 }}>
    <label htmlFor={id} style={{ display: 'block' }}>{t(image ? 'longreadFiles.uploadImage' : 'longreadFiles.uploadFiles')}</label>
    <input id={id} type="file" accept={acceptFiles(image)} multiple={!image} disabled={busy} style={{ width: '100%', maxWidth: '100%', minHeight: 44 }} onChange={(event) => {
      const selected = [...event.currentTarget.files ?? []]; event.currentTarget.value = ''; if (!selected.length) return;
      let files: File[]; try { files = prepareFiles(selected, image); } catch (cause) { setError(t(`longreadFiles.errors.${cause instanceof Error ? cause.message : 'type'}`)); return; }
      setBusy(true); setError(''); setStatus(t('longreadFiles.uploading', { percent: 0 }));
      void (async () => {
        const created = await createLongreadFiles(lessonId, files.map((file) => ({ fileName: file.name, mimeType: file.type, sizeBytes: file.size })));
        createdCallback.current(created);
        for (let i = 0; i < files.length; i++) {
          const fileId = created[i]!.id, path = `/lessons/${encodeURIComponent(lessonId)}/longread/files/${encodeURIComponent(fileId)}`;
          await uploadMaterialFileWithProgress(fileId, files[i]!, (percent) => setStatus(t('longreadFiles.uploading', { percent: Math.round((i * 100 + percent) / files.length) })), { buffered: `${path}/content`, multipart: `${path}/multipart` });
        }
        window.dispatchEvent(new CustomEvent('longread-files-updated', { detail: { lessonId } }));
        setStatus(t('longreadFiles.uploaded'));
      })().catch(() => { setStatus(''); setError(t('longreadFiles.errors.upload')); }).finally(() => setBusy(false));
    }} />
    <small>{t('longreadFiles.limits')}</small>
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
export function FileStatus({ lessonId, fileId }: { lessonId: string; fileId: string }) {
  const { t } = useTranslation(); const [file, setFile] = useState<LongreadFile | null>(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent<{ lessonId: string }>).detail?.lessonId === lessonId) setRetry((n) => n + 1); };
    window.addEventListener('longread-files-updated', changed);
    return () => window.removeEventListener('longread-files-updated', changed);
  }, [lessonId]);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try { const result = await getLongreadFile(lessonId, fileId, controller.signal); if (!controller.signal.aborted) { setFile(result); setError(false); if (!result.scanStatus || ['pending', 'scanning'].includes(result.scanStatus)) timer = setTimeout(() => void load(), 10000); } }
      catch { if (!controller.signal.aborted) setError(true); }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [lessonId, fileId, retry]);
  return <span role="status" style={{ overflowWrap: 'anywhere' }}>{error ? <>{t('longreadFiles.unavailable')} <button type="button" onClick={() => setRetry((n) => n + 1)}>{t('longread.retry')}</button></> : `${file?.fileName ?? ''} · ${t(`longreadFiles.scan.${file?.scanStatus ?? 'pending'}`)}`}</span>;
}
export function ImageFields({ lessonId, image, onChange }: { lessonId: string; image: LongreadImage; onChange: (patch: Partial<LongreadImage>) => void }) {
  const { t } = useTranslation(), id = useId();
  if (!image || typeof image.alt !== 'string' || typeof image.caption !== 'string' || typeof image.width !== 'number' || typeof image.align !== 'string' || image.fileId !== null && typeof image.fileId !== 'string') return <p>{t('longread.unknownMessage')}</p>;
  return <div style={{ minWidth: 0 }}>
    <UploadPicker lessonId={lessonId} image onCreated={(files) => onChange({ fileId: files[0]!.id })} />
    {image.fileId && <><FileStatus lessonId={lessonId} fileId={image.fileId} /><LongreadMediaContext.Provider value={{ lessonId, version: null }}><MediaImage image={image} /></LongreadMediaContext.Provider>
      <button type="button" className="admin-btn admin-btn--secondary" onClick={() => onChange({ fileId: null })}>{t('longreadFiles.removeImage')}</button></>}
    <label htmlFor={`${id}-alt`} style={{ display: 'block', marginBlockStart: 12 }}>{t('longreadFiles.alt')}</label><input id={`${id}-alt`} value={image.alt} maxLength={2000} onChange={(event) => onChange({ alt: event.target.value })} />
    <label htmlFor={`${id}-caption`} style={{ display: 'block' }}>{t('longreadFiles.caption')}</label><textarea id={`${id}-caption`} value={image.caption} maxLength={2000} onChange={(event) => onChange({ caption: event.target.value })} style={{ width: '100%', maxWidth: '100%' }} />
    <label htmlFor={`${id}-width`} style={{ display: 'block' }}>{t('longreadFiles.width')}</label><input id={`${id}-width`} type="number" min={10} max={100} value={image.width} onChange={(event) => onChange({ width: Number(event.target.value) })} />
    <label htmlFor={`${id}-align`} style={{ display: 'block' }}>{t('longreadFiles.align')}</label><select id={`${id}-align`} value={image.align} onChange={(event) => onChange({ align: event.target.value as LongreadImage['align'] })}>{(['start', 'center', 'end'] as const).map((value) => <option value={value} key={value}>{t(`longreadFiles.${value}`)}</option>)}</select>
  </div>;
}
export function CoverEditor({ lessonId, value, onChange, label }: { lessonId: string; value?: LongreadImage | null; onChange: (image: LongreadImage | null) => void; label: string }) {
  const { t } = useTranslation();
  return <details className="admin-card" style={{ marginBlock: 12, minWidth: 0 }}><summary style={{ minHeight: 44 }}>{label}</summary>
    {!value ? <button type="button" className="admin-btn admin-btn--secondary" onClick={() => onChange(emptyImage())}>{t('longreadFiles.addCover')}</button> : <>
      <ImageFields lessonId={lessonId} image={value} onChange={(patch) => onChange({ ...value, ...patch })} />
      <button type="button" className="admin-btn admin-btn--secondary" style={{ marginBlock: 12 }} onClick={() => onChange(null)}>{t('longreadFiles.removeCover')}</button>
    </>}
  </details>;
}
export function AttachmentEditor({ lessonId, files, onChange }: { lessonId: string; files: { fileId: string; label?: string }[]; onChange: (update: (previous: typeof files) => typeof files) => void }) {
  const { t } = useTranslation();
  if (!isAttachmentsContent({ files })) return <p>{t('longread.unknownMessage')}</p>;
  return <div><UploadPicker lessonId={lessonId} image={false} onCreated={(created) => onChange((previous) => [...previous, ...created.map((file) => ({ fileId: file.id, label: file.fileName }))])} />
    <ul style={{ paddingInlineStart: 20 }}>{files.map((file) => <li key={file.fileId} style={{ marginBlock: 12, overflowWrap: 'anywhere' }}><FileStatus lessonId={lessonId} fileId={file.fileId} />{' '}<button type="button" className="admin-btn admin-btn--secondary" style={{ minHeight: 44, maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'start' }} onClick={() => onChange((previous) => previous.filter((item) => item.fileId !== file.fileId))}>{t('longreadFiles.removeFile', { name: file.label ?? file.fileId })}</button></li>)}</ul>
  </div>;
}
