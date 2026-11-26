import { useCallback, useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';

import type { ChecklistVoiceKind, ChecklistVoiceNote, ChecklistVoiceSettings } from '../shared/api/checklists.js';
import { ApiClientError } from '../shared/apiClient.js';
import { readStored, writeStored } from '../shared/dictation.js';
import { useProtectedImage } from '../shared/useProtectedImage.js';
import {
  canRecordVoice, formatVoiceClock, startVoiceRecording, VOICE_HINT_KEY, VOICE_MAX_MS, VOICE_MIN_MS, VOICE_PER_COMMENT, VOICE_WARN_MS,
  VoiceRecordingError, type ChecklistVoiceApi, type VoiceRecording, type VoiceSession,
} from './checklistVoice.js';

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'recording' }
  | { kind: 'preview'; recording: VoiceRecording; url: string }
  | { kind: 'uploading'; recording: VoiceRecording; url: string };

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

/** One saved recording: the sound is fetched through the API (no public link) and played by the native controls (pause, seek, keyboard). */
function SavedVoiceNote({ api, instanceId, note, index, editable, busy, onRemove, t }: {
  api: ChecklistVoiceApi; instanceId: string; note: ChecklistVoiceNote; index: number; editable: boolean; busy: boolean; onRemove: () => void; t: TFunction;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState(1);
  const sound = useProtectedImage(() => api.blob(instanceId, note.id), note.createdAt);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed, sound.url]);
  const label = t('voiceNote.saved', 'Voice recording {{n}} ({{time}})', { n: index + 1, time: formatVoiceClock(note.durationMs) });
  return (
    <li style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none' }}>
      {sound.status === 'ready' ? (
        <audio aria-label={label} controls preload="metadata" ref={audioRef} src={sound.url} style={{ maxWidth: '100%', minWidth: 0 }} />
      ) : sound.status === 'error' ? (
        <>
          <span role="alert" style={{ color: 'var(--color-danger)' }}>{t('voiceNote.loadError', 'The recording could not be loaded.')}</span>
          <button className="ds-button ds-button--secondary ds-button--sm" onClick={sound.retry} style={{ minHeight: 44 }} type="button">{t('voiceNote.retry', 'Try again')}</button>
        </>
      ) : <span>{label}…</span>}
      {sound.status === 'ready' && (
        <label style={{ alignItems: 'center', display: 'inline-flex', fontSize: 13, gap: 6 }}>
          <span>{t('voiceNote.speed', 'Speed')}</span>
          <select aria-label={t('voiceNote.speedFor', 'Playback speed of recording {{n}}', { n: index + 1 })} className="ds-input" onChange={(event) => setSpeed(Number(event.target.value))} style={{ minHeight: 44, width: 'auto' }} value={speed}>
            {SPEEDS.map((value) => <option key={value} value={value}>{`${value}×`}</option>)}
          </select>
        </label>
      )}
      {editable && (
        <button aria-label={t('voiceNote.deleteFor', 'Delete recording {{n}}', { n: index + 1 })} className="ds-button ds-button--secondary ds-button--sm" disabled={busy} onClick={onRemove} style={{ minHeight: 44 }} type="button">
          {t('voiceNote.delete', 'Delete')}
        </button>
      )}
    </li>
  );
}

/** No answer from the server at all: a failed fetch is a plain TypeError, a timeout is 408, an upload that broke off is status 0. */
const isOffline = (error: unknown) => !(error instanceof ApiClientError) || error.status === 0 || error.status === 408;

/** What went wrong with the server call, in words the person can act on. */
function uploadProblem(error: unknown, t: TFunction, max: number): string {
  if (isOffline(error)) return t('voiceNote.errorOffline', 'No connection. Your recording is kept: check the internet and press "Send" again.');
  if (error instanceof ApiClientError) {
    if (error.status === 409) return t('voiceNote.errorLimit', 'There are already {{max}} recordings here. Delete one to add another.', { max });
    if (error.status === 400 || error.status === 403) return t('voiceNote.errorClosed', 'The recording was not saved: the check can no longer be changed, or recording sound was turned off.');
  }
  return t('voiceNote.errorUpload', 'The recording was not sent. It is kept: press "Send" to try again.');
}

/**
 * PR 510: "Record sound" next to the dictation of a comment. Records with a timer and a warning before the limit, lets the person
 * listen before sending (and record again), then stores it through `api`. A recording counts as the explanation of an answer.
 * Not drawn where the browser cannot record; the comment stays a plain text field.
 */
export function ChecklistVoiceNotes({ api, instanceId, itemId, notes, editable, onChanged, t, settings, kind }: {
  api: ChecklistVoiceApi; instanceId: string; itemId: string | null; notes: ChecklistVoiceNote[]; editable: boolean; onChanged: () => void; t: TFunction;
  /** PR 511: what the organization and the checklist allow. Without it the limits of the server apply and recording is offered. */
  settings?: ChecklistVoiceSettings;
  /** PR 512: the comment of an answer (default), a reviewer's comment or one of the session's closing texts (no criterion). */
  kind?: ChecklistVoiceKind;
}) {
  const maxMs = settings ? Math.min(settings.maxSeconds * 1000, VOICE_MAX_MS) : VOICE_MAX_MS;
  const perComment = settings ? Math.min(settings.perComment, VOICE_PER_COMMENT) : VOICE_PER_COMMENT;
  const mayRecord = settings ? settings.voiceNotes : true;
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const session = useRef<VoiceSession | null>(null);
  const supported = canRecordVoice();

  // The timer only reads the clock; the stop at the limit is the same call as the button.
  useEffect(() => {
    if (phase.kind !== 'recording') return undefined;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const ms = Date.now() - startedAt;
      setElapsed(ms);
      if (ms >= maxMs) session.current?.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase.kind, maxMs]);
  // Leaving the screen releases the microphone and the preview.
  useEffect(() => () => { session.current?.cancel(); }, []);
  const previewUrl = phase.kind === 'preview' || phase.kind === 'uploading' ? phase.url : null;
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const full = notes.length >= perComment;
  const start = useCallback(async () => {
    setProblem(null);
    setElapsed(0);
    setPhase({ kind: 'starting' });
    try {
      const next = await startVoiceRecording();
      session.current = next;
      if (readStored(VOICE_HINT_KEY) === null) { writeStored(VOICE_HINT_KEY, '1'); setHint(true); }
      setPhase({ kind: 'recording' });
      const recording = await next.result;
      session.current = null;
      if (recording.durationMs < VOICE_MIN_MS) { setProblem(t('voiceNote.tooShort', 'The recording is too short. Hold on a little longer and speak.')); setPhase({ kind: 'idle' }); return; }
      setPhase({ kind: 'preview', recording, url: URL.createObjectURL(recording.blob) });
    } catch (error) {
      session.current = null;
      const code = error instanceof VoiceRecordingError ? error.problem : 'failed';
      setProblem(code === 'denied'
        ? t('voiceNote.errorDenied', 'No access to the microphone. Allow it in the site settings of your browser (the lock icon next to the address) and press "Try again".')
        : code === 'no-microphone'
          ? t('voiceNote.errorNoMicrophone', 'No microphone was found. Connect one and press "Try again".')
          : t('voiceNote.errorFailed', 'The recording stopped because of an error. Press "Try again".'));
      setPhase({ kind: 'idle' });
    }
  }, [t]);

  async function send() {
    if (phase.kind !== 'preview') return;
    const current = phase;
    setProblem(null);
    setPhase({ kind: 'uploading', recording: current.recording, url: current.url });
    try {
      await api.upload(instanceId, itemId, current.recording.blob, Math.min(current.recording.durationMs, maxMs), undefined, kind);
      setPhase({ kind: 'idle' });
      setHint(false);
      onChanged();
    } catch (error) {
      setProblem(uploadProblem(error, t, perComment));
      setPhase({ kind: 'preview', recording: current.recording, url: current.url });
    }
  }
  async function remove(note: ChecklistVoiceNote) {
    setProblem(null);
    setRemoving(note.id);
    try {
      await api.remove(instanceId, note.id);
      onChanged();
    } catch (error) {
      setProblem(error instanceof ApiClientError && error.status === 403
        ? t('voiceNote.errorNotAuthor', 'Only the author can delete a recording.')
        : t('voiceNote.errorDelete', 'The recording could not be deleted. Check the connection and try again.'));
    } finally {
      setRemoving(null);
    }
  }

  if ((!supported || !mayRecord) && notes.length === 0) return null;
  const recording = phase.kind === 'recording';
  const left = maxMs - elapsed;
  const warning = recording && left <= VOICE_WARN_MS;
  const busy = phase.kind === 'starting' || phase.kind === 'uploading';

  return (
    <div aria-label={t('voiceNote.group', 'Voice recordings')} role="group" style={{ display: 'grid', gap: 8, marginTop: 8, minWidth: 0 }}>
      {notes.length > 0 && (
        <ul style={{ display: 'grid', gap: 8, margin: 0, padding: 0 }}>
          {notes.map((note, index) => (
            <SavedVoiceNote api={api} busy={removing === note.id || busy} editable={editable} index={index} instanceId={instanceId} key={note.id} note={note} onRemove={() => void remove(note)} t={t} />
          ))}
        </ul>
      )}
      {editable && supported && mayRecord && (phase.kind === 'idle' || recording || phase.kind === 'starting') && (
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            aria-pressed={recording}
            className={`ds-button ${recording ? 'ds-button--primary' : 'ds-button--secondary'} ds-button--sm`}
            disabled={busy || (!recording && full)}
            id={`voice-${kind?.field ?? kind?.place ?? 'answer'}-${itemId ?? 'summary'}`}
            onClick={() => (recording ? session.current?.stop() : void start())}
            style={{ minHeight: 44, minWidth: 44 }}
            type="button"
          >
            <span aria-hidden="true">{recording ? '■' : '🎙'}</span>{' '}
            {recording ? t('voiceNote.stop', 'Stop recording') : t('voiceNote.start', 'Record sound')}
          </button>
          {recording && (
            <span aria-hidden="true" style={{ color: 'var(--color-danger)', fontVariantNumeric: 'tabular-nums' }}>● {formatVoiceClock(elapsed)} / {formatVoiceClock(maxMs)}</span>
          )}
          {!recording && full && <span>{t('voiceNote.full', 'There are already {{max}} recordings here. Delete one to add another.', { max: perComment })}</span>}
        </div>
      )}
      <span className="ui-visually-hidden" role="status">{recording ? t('voiceNote.recording', 'Recording is on, speak') : ''}</span>
      {warning && <p role="alert" style={{ color: 'var(--color-warning, var(--color-danger))', margin: 0 }}>{t('voiceNote.warning', 'The recording stops in {{seconds}} s.', { seconds: Math.max(0, Math.ceil(left / 1000)) })}</p>}
      {mayRecord && (phase.kind === 'preview' || phase.kind === 'uploading') && (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0 }}>{t('voiceNote.previewTitle', 'Listen before sending ({{time}})', { time: formatVoiceClock(phase.recording.durationMs) })}</p>
          <audio aria-label={t('voiceNote.previewLabel', 'New recording, not sent yet')} controls src={phase.url} style={{ maxWidth: '100%', minWidth: 0 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="ds-button ds-button--primary ds-button--sm" disabled={phase.kind === 'uploading' || full} onClick={() => void send()} style={{ minHeight: 44 }} type="button">
              {phase.kind === 'uploading' ? t('voiceNote.sending', 'Sending…') : t('voiceNote.send', 'Send')}
            </button>
            <button className="ds-button ds-button--secondary ds-button--sm" disabled={phase.kind === 'uploading'} onClick={() => void start()} style={{ minHeight: 44 }} type="button">{t('voiceNote.rerecord', 'Record again')}</button>
            <button className="ds-button ds-button--secondary ds-button--sm" disabled={phase.kind === 'uploading'} onClick={() => { setProblem(null); setHint(false); setPhase({ kind: 'idle' }); }} style={{ minHeight: 44 }} type="button">{t('voiceNote.discard', 'Discard')}</button>
          </div>
        </div>
      )}
      {hint && <p className="admin-form__hint" role="note" style={{ margin: 0 }}>{t('voiceNote.hint', 'The recording is saved in the checklist, so the reviewer can listen to it.')}</p>}
      {problem && (
        <p role="alert" style={{ color: 'var(--color-danger)', margin: 0 }}>
          {problem}
          {phase.kind === 'idle' && supported && editable && !full && (
            <>{' '}<button className="ds-button ds-button--secondary ds-button--sm" onClick={() => void start()} style={{ minHeight: 44 }} type="button">{t('voiceNote.retry', 'Try again')}</button></>
          )}
        </p>
      )}
    </div>
  );
}
