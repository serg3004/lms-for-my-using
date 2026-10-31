import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LongreadAudio, LongreadVideo, LongreadEmbed } from '@lms/shared/longread-media';
import { resolveLongreadEmbed } from '../../shared/api/longreads.js';
import { FileStatus, UploadPicker } from '../longread-files/FileEditors.js';
import { LongreadMediaContext, MediaImage } from '../longread-files/Media.js';
import { MediaPlayer, EmbeddedVideo } from './MediaPlayback.js';

type Props = { lessonId: string; content: Record<string, unknown>; onChange: (content: Record<string, unknown>) => void };
export function AudioEditor({ lessonId, content, onChange }: Props) {
  const { t } = useTranslation(), id = useId();
  if (typeof content.caption !== 'string' || content.fileId !== null && typeof content.fileId !== 'string') return <p>{t('longread.unknownMessage')}</p>;
  return <div>
    <UploadPicker lessonId={lessonId} category="audio" onCreated={(files) => onChange({ ...content, fileId: files[0]!.id })} />
    {typeof content.fileId === 'string' && <><FileStatus lessonId={lessonId} fileId={content.fileId} /><button className="admin-btn admin-btn--secondary" type="button" onClick={() => onChange({ ...content, fileId: null })}>{t('longreadMedia.remove')}</button></>}
    <label htmlFor={`${id}-caption`}>{t('longreadFiles.caption')}</label><textarea id={`${id}-caption`} value={content.caption} maxLength={2000} style={{ width: '100%' }} onChange={(event) => onChange({ ...content, caption: event.target.value })} />
    <LongreadMediaContext.Provider value={{ lessonId, version: null }}><MediaPlayer type="audio" content={content as LongreadAudio} /></LongreadMediaContext.Provider>
  </div>;
}

export function VideoEditor({ lessonId, content, onChange }: Props) {
  const { t } = useTranslation(), id = useId();
  if (!['file', 'url'].includes(String(content.source)) || typeof content.caption !== 'string' || typeof content.width !== 'number') return <p>{t('longread.unknownMessage')}</p>;
  const video = content as LongreadVideo;
  return <div>
    <label htmlFor={`${id}-source`}>{t('longreadMedia.source')}</label>
    <select id={`${id}-source`} value={video.source} style={{ minHeight: 44, maxWidth: '100%' }} onChange={(event) => onChange({ caption: video.caption, width: video.width, poster: video.poster, ...(event.target.value === 'file' ? { source: 'file', fileId: null } : { source: 'url', url: '' }) })}>
      <option value="file">{t('longreadMedia.fileSource')}</option><option value="url">{t('longreadMedia.urlSource')}</option>
    </select>
    {video.source === 'file' ? <>
      <UploadPicker lessonId={lessonId} category="video" onCreated={(files) => onChange({ ...content, fileId: files[0]!.id })} />
      {video.fileId && <><FileStatus lessonId={lessonId} fileId={video.fileId} /><button type="button" className="admin-btn admin-btn--secondary" onClick={() => onChange({ ...content, fileId: null })}>{t('longreadMedia.remove')}</button></>}
    </> : <><label htmlFor={`${id}-url`}>{t('longreadMedia.videoUrl')}</label><input id={`${id}-url`} type="url" value={video.url} maxLength={2048} style={{ width: '100%' }} onChange={(event) => onChange({ ...content, url: event.target.value })} /><p>{t('longreadMedia.urlHelp')}</p></>}
    <details className="admin-card" style={{ marginBlock: 12 }}><summary style={{ minHeight: 44 }}>{t('longreadMedia.poster')}</summary>
      <UploadPicker lessonId={lessonId} image onCreated={(files) => onChange({ ...content, poster: { fileId: files[0]!.id } })} />
      {video.poster?.fileId && <>
        <FileStatus lessonId={lessonId} fileId={video.poster.fileId} />
        <LongreadMediaContext.Provider value={{ lessonId, version: null }}><MediaImage image={{ fileId: video.poster.fileId, alt: t('longreadMedia.poster'), caption: '', width: 100, align: 'center' }} /></LongreadMediaContext.Provider>
        <button type="button" className="admin-btn admin-btn--secondary" onClick={() => onChange({ ...content, poster: null })}>{t('longreadMedia.removePoster')}</button>
      </>}
    </details>
    <label htmlFor={`${id}-caption`}>{t('longreadFiles.caption')}</label><textarea id={`${id}-caption`} maxLength={2000} value={video.caption} style={{ width: '100%' }} onChange={(event) => onChange({ ...content, caption: event.target.value })} />
    <label htmlFor={`${id}-width`}>{t('longreadFiles.width')}</label><input id={`${id}-width`} type="number" min={10} max={100} value={video.width} onChange={(event) => onChange({ ...content, width: Number(event.target.value) })} />
    <LongreadMediaContext.Provider value={{ lessonId, version: null }}><MediaPlayer type="video" content={video} /></LongreadMediaContext.Provider>
  </div>;
}

export function EmbedEditor({ lessonId, content, onChange }: Props) {
  const { t } = useTranslation(), id = useId();
  const [input, setInput] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const latest = useRef({ content, onChange }); latest.current = { content, onChange };
  if (typeof content.caption !== 'string' || typeof content.width !== 'number') return <p>{t('longread.unknownMessage')}</p>;
  const embed = content as LongreadEmbed;
  return <div>
    <label htmlFor={`${id}-input`}>{t('longreadMedia.embedInput')}</label>
    <textarea id={`${id}-input`} maxLength={8192} value={input} style={{ width: '100%' }} onChange={(event) => setInput(event.target.value)} />
    <p>{t('longreadMedia.embedHelp')}</p>
    <button type="button" className="admin-btn admin-btn--secondary" disabled={busy || !input.trim()} onClick={() => {
      setBusy(true); setError(false);
      void resolveLongreadEmbed(lessonId, input).then((source) => { latest.current.onChange({ ...latest.current.content, source }); setInput(''); }).catch(() => setError(true)).finally(() => setBusy(false));
    }}>{t(busy ? 'common.saving' : 'longreadMedia.applyEmbed')}</button>
    {error && <p role="alert">{t('longreadMedia.embedInvalid')}</p>}
    {embed.source && <button type="button" className="admin-btn admin-btn--secondary" onClick={() => onChange({ ...content, source: null })}>{t('longreadMedia.remove')}</button>}
    <label htmlFor={`${id}-caption`}>{t('longreadFiles.caption')}</label><textarea id={`${id}-caption`} maxLength={2000} value={embed.caption} style={{ width: '100%' }} onChange={(event) => onChange({ ...content, caption: event.target.value })} />
    <label htmlFor={`${id}-width`}>{t('longreadFiles.width')}</label><input id={`${id}-width`} type="number" min={10} max={100} value={embed.width} onChange={(event) => onChange({ ...content, width: Number(event.target.value) })} />
    <EmbeddedVideo content={embed} />
  </div>;
}
