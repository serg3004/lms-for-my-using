import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { canonicalVideoUrl, embedUrl, embedWatchUrl, type LongreadAudio, type LongreadVideo, type LongreadEmbed } from '@lms/shared/longread-media';
import { getLongreadFile, getLongreadFileUrl } from '../../shared/api/longreads.js';
import { LongreadMediaContext } from '../longread-files/Media.js';

const PlaybackContext = createContext<{ rate: number; setRate: (rate: number) => void } | null>(null);
export function MediaPlaybackProvider({ children }: { children: ReactNode }) {
  const [rate, setRate] = useState(1);
  return <PlaybackContext.Provider value={{ rate, setRate }}>{children}</PlaybackContext.Provider>;
}

function useMediaFile(fileId: string | null) {
  const context = useContext(LongreadMediaContext), lessonId = context?.lessonId, version = context?.version;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ url: '', expiresAt: 0, loading: false, error: false });
  const reload = useCallback(() => { setState((value) => ({ ...value, url: '', loading: true, error: false })); setRetry((value) => value + 1); }, []);
  useEffect(() => {
    const updated = (event: Event) => { if ((event as CustomEvent<{ lessonId: string }>).detail?.lessonId === lessonId) reload(); };
    window.addEventListener('longread-files-updated', updated);
    return () => window.removeEventListener('longread-files-updated', updated);
  }, [lessonId, reload]);
  useEffect(() => {
    setState({ url: '', expiresAt: 0, loading: !!fileId, error: false });
    if (!fileId || !lessonId || version === undefined) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined, attempts = 0;
    async function load() {
      try {
        const result = await getLongreadFileUrl(lessonId!, fileId!, version!, controller.signal);
        if (!controller.signal.aborted) setState({ url: result.url, expiresAt: Date.now() + result.expiresIn * 1000, loading: false, error: false });
      } catch {
        if (controller.signal.aborted) return;
        if (version === null && attempts++ < 40) {
          try {
            const metadata = await getLongreadFile(lessonId!, fileId!, controller.signal);
            if (metadata.scanStatus === null || ['pending', 'scanning'].includes(metadata.scanStatus)) { timer = setTimeout(() => void load(), 10000); return; }
          } catch { /* Access loss and rejected files stay unavailable. */ }
        }
        if (!controller.signal.aborted) setState({ url: '', expiresAt: 0, loading: false, error: true });
      }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [fileId, lessonId, version, retry]);
  return { ...state, reload };
}

const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const buttonStyle: CSSProperties = { minHeight: 44, minWidth: 44, maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere' };
export function MediaPlayer({ type, content }: { type: 'audio' | 'video'; content: LongreadAudio | LongreadVideo }) {
  const { t } = useTranslation(), id = useId();
  const shared = useContext(PlaybackContext); const [localRate, setLocalRate] = useState(1);
  const rate = shared?.rate ?? localRate, setRate = shared?.setRate ?? setLocalRate;
  const video = type === 'video' ? content as LongreadVideo : null;
  const fileId = video?.source === 'url' ? null : (content as LongreadAudio).fileId;
  const file = useMediaFile(fileId), poster = useMediaFile(video?.poster?.fileId ?? null);
  const source = video?.source === 'url' ? canonicalVideoUrl(video.url) ?? '' : file.url;
  const element = useRef<HTMLMediaElement | null>(null);
  const bind = useCallback((node: HTMLMediaElement | null) => { element.current = node; }, []);
  const [playing, setPlaying] = useState(false), [error, setError] = useState(false);
  const [duration, setDuration] = useState(0), [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(1), [muted, setMuted] = useState(false);
  const restore = useRef<{ time: number; play: boolean } | null>(null), automaticRefresh = useRef(0);
  useEffect(() => { if (element.current && type === 'audio') element.current.playbackRate = rate; }, [rate, type, source]);
  const externalUrl = video?.source === 'url' ? video.url : null;
  useEffect(() => { setError(false); setPlaying(false); setDuration(0); setPosition(0); restore.current = null; }, [fileId, externalUrl]);
  function remember(play = playing) { restore.current = { time: element.current?.currentTime ?? position, play }; }
  function retry() {
    remember(); setError(false);
    if (fileId) file.reload(); else element.current?.load();
  }
  function failed() {
    if (file.loading) return;
    if (fileId && file.expiresAt && Date.now() >= file.expiresAt && Date.now() - automaticRefresh.current > 5000) {
      automaticRefresh.current = Date.now(); remember(); file.reload(); return;
    }
    setError(true); setPlaying(false);
  }
  function play() {
    if (!element.current) return;
    if (fileId && Date.now() >= file.expiresAt) { remember(true); file.reload(); return; }
    void element.current.play().catch(() => setError(true));
  }
  function seek(value: number) {
    if (element.current && Number.isFinite(duration) && duration > 0) {
      const next = Math.max(0, Math.min(duration, value)); setPosition(next); element.current.currentTime = next;
    }
  }
  const mediaProps = {
    ref: bind, src: source || undefined, preload: 'metadata' as const,
    'aria-label': content.caption || t(`longread.types.${type}`),
    onLoadedMetadata: () => {
      const node = element.current; if (!node) return;
      setError(false); setDuration(Number.isFinite(node.duration) ? node.duration : 0);
      if (type === 'audio') { node.playbackRate = rate; node.volume = volume; node.muted = muted; }
      const saved = restore.current; restore.current = null;
      if (saved) { if (Number.isFinite(node.duration)) node.currentTime = Math.min(saved.time, node.duration); if (saved.play) void node.play().catch(() => setError(true)); }
    },
    onDurationChange: () => { const value = element.current?.duration; if (value && Number.isFinite(value)) setDuration(value); },
    onTimeUpdate: () => setPosition(element.current?.currentTime ?? 0),
    onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onEnded: () => setPlaying(false), onError: failed,
  };
  return <figure style={{ width: video ? `${video.width}%` : '100%', maxWidth: '100%', minWidth: 0, marginBlock: 16, marginInline: 'auto', overflowWrap: 'anywhere' }}>
    {type === 'audio' ? <audio {...mediaProps} /> : <video {...mediaProps} controls playsInline poster={poster.url || undefined} style={{ display: 'block', width: '100%', maxWidth: '100%', aspectRatio: '16 / 9', background: '#111' }} />}
    {file.loading && !source && <p role="status">{t('longreadFiles.checking')}</p>}
    {!fileId && !source && <p role="status">{t('longreadMedia.noSource')}</p>}
    {type === 'audio' && <div role="group" aria-label={t('longreadMedia.audioControls')} style={{ display: 'grid', gap: 12, padding: 12, border: '1px solid var(--color-border)', borderRadius: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="admin-btn admin-btn--secondary" style={buttonStyle} disabled={!source || file.loading} onClick={() => playing ? element.current?.pause() : play()}>{t(playing ? 'longreadMedia.pause' : 'longreadMedia.play')}</button>
        <button type="button" className="admin-btn admin-btn--secondary" style={buttonStyle} disabled={!duration} onClick={() => seek(position - 15)}>{t('longreadMedia.back15')}</button>
        <button type="button" className="admin-btn admin-btn--secondary" style={buttonStyle} disabled={!duration} onClick={() => seek(position + 15)}>{t('longreadMedia.forward15')}</button>
        <button type="button" className="admin-btn admin-btn--secondary" style={buttonStyle} aria-pressed={muted} onClick={() => { const value = !muted; setMuted(value); if (element.current) element.current.muted = value; }}>{t(muted ? 'longreadMedia.unmute' : 'longreadMedia.mute')}</button>
      </div>
      <label htmlFor={`${id}-seek`}>{t('longreadMedia.position')} · <bdi dir="ltr">{timeLabel(position)} / {timeLabel(duration)}</bdi></label>
      <input id={`${id}-seek`} type="range" min={0} max={duration || 1} step={0.1} value={Math.min(position, duration || 1)} disabled={!duration} aria-valuetext={`${timeLabel(position)} / ${timeLabel(duration)}`} onChange={(event) => seek(Number(event.target.value))} style={{ width: '100%', minHeight: 44 }} />
      <label htmlFor={`${id}-volume`}>{t('longreadMedia.volume')}</label>
      <input id={`${id}-volume`} type="range" min={0} max={1} step={0.01} value={volume} aria-valuetext={`${Math.round(volume * 100)}%`} onChange={(event) => { const value = Number(event.target.value); setVolume(value); if (element.current) element.current.volume = value; }} style={{ width: '100%', minHeight: 44 }} />
      <label htmlFor={`${id}-speed`}>{t('longreadMedia.speed')}</label>
      <select id={`${id}-speed`} value={rate} onChange={(event) => setRate(Number(event.target.value))} style={{ minHeight: 44, maxWidth: '100%' }}>{[0.75, 1, 1.25, 1.5, 1.75, 2].map((value) => <option key={value} value={value}>{value}×</option>)}</select>
    </div>}
    {(error || file.error) && <div role="alert"><p>{t('longreadMedia.unavailable')}</p><button type="button" className="admin-btn admin-btn--secondary" style={buttonStyle} onClick={retry}>{t('longread.retry')}</button></div>}
    {video?.source === 'url' && source && <a href={source} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>{t('longreadMedia.openSource')}</a>}
    {content.caption && <figcaption>{content.caption}</figcaption>}
  </figure>;
}

export function EmbeddedVideo({ content }: { content: LongreadEmbed }) {
  const { t } = useTranslation(); const [open, setOpen] = useState(false), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const source = content.source; const [loaded, setLoaded] = useState(false);
  useEffect(() => { setOpen(false); setLoaded(false); setFailed(false); }, [source?.provider, source?.videoId]);
  useEffect(() => {
    if (!open || loaded) return;
    const timer = setTimeout(() => setFailed(true), 15000); return () => clearTimeout(timer);
  }, [open, loaded, attempt]);
  if (!source) return <p>{t('longreadMedia.noSource')}</p>;
  return <figure style={{ width: `${content.width}%`, maxWidth: '100%', minWidth: 0, marginBlock: 16, marginInline: 'auto', overflowWrap: 'anywhere' }}>
    {!open ? <button type="button" className="admin-btn admin-btn--secondary" style={buttonStyle} onClick={() => setOpen(true)}>{t('longreadMedia.loadEmbed', { provider: source.provider === 'youtube' ? 'YouTube' : 'Vimeo' })}</button> : <iframe key={attempt} src={embedUrl(source)} title={content.caption || t('longreadMedia.embeddedVideo')} sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onLoad={() => { setLoaded(true); setFailed(false); }} onError={() => setFailed(true)} style={{ display: 'block', width: '100%', maxWidth: '100%', border: 0, aspectRatio: '16 / 9' }} />}
    {failed && <div role="alert"><p>{t('longreadMedia.embedUnavailable')}</p><button type="button" className="admin-btn admin-btn--secondary" style={buttonStyle} onClick={() => { setLoaded(false); setFailed(false); setAttempt((value) => value + 1); }}>{t('longread.retry')}</button></div>}
    <a href={embedWatchUrl(source)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>{t('longreadMedia.openSource')}</a>
    {content.caption && <figcaption>{content.caption}</figcaption>}
  </figure>;
}
