import { useEffect, useState } from 'react';

import type { ChecklistVoiceKind, ChecklistVoiceNote, ChecklistVoiceSettings } from '../shared/api/checklists.js';

/** PR 510: what the taking screen needs from the server for recordings; the guest page supplies its own pass-key version. */
export type ChecklistVoiceApi = {
  list: (instanceId: string) => Promise<ChecklistVoiceNote[]>;
  upload: (instanceId: string, itemId: string | null, blob: Blob, durationMs: number, replaceId?: string, kind?: ChecklistVoiceKind) => Promise<ChecklistVoiceNote>;
  blob: (instanceId: string, noteId: string) => Promise<Blob>;
  remove: (instanceId: string, noteId: string) => Promise<unknown>;
  /** PR 511: what the organization and the checklist allow; without it the defaults below apply. */
  settings?: (instanceId: string) => Promise<ChecklistVoiceSettings>;
};

/** PR 511: until the server answers (or when it cannot), dictation is offered and recording is not. */
export const DEFAULT_VOICE_SETTINGS: ChecklistVoiceSettings = { dictation: true, voiceNotes: false, maxSeconds: 120, perComment: 3 };

export function useVoiceSettings(api: Pick<ChecklistVoiceApi, 'settings'> | undefined, instanceId: string): ChecklistVoiceSettings {
  const [settings, setSettings] = useState<ChecklistVoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const load = api?.settings;
  useEffect(() => {
    let active = true;
    setSettings(DEFAULT_VOICE_SETTINGS);
    if (!load) return undefined;
    Promise.resolve()
      .then(() => load(instanceId))
      .then((next) => { if (active && next && typeof next.voiceNotes === 'boolean') setSettings({ ...DEFAULT_VOICE_SETTINGS, ...next }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [load, instanceId]);
  return settings;
}

/** The upper limits of the server; PR 511 lets an organization choose lower values (the screen reads them from the settings). */
export const VOICE_MAX_MS = 2 * 60 * 1000;
export const VOICE_MIN_MS = 300;
export const VOICE_WARN_MS = 15 * 1000;
export const VOICE_PER_COMMENT = 3;
export const VOICE_HINT_KEY = 'lms.voice-note.hint-seen';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

type RecorderCtor = { new (stream: MediaStream, options?: { mimeType?: string }): MediaRecorder; isTypeSupported?: (type: string) => boolean };
const recorderCtor = (): RecorderCtor | null => (typeof window !== 'undefined' && 'MediaRecorder' in window ? (window as unknown as { MediaRecorder: RecorderCtor }).MediaRecorder : null);

/** Hidden where the browser cannot record: no MediaRecorder or no microphone API (an insecure page has none). */
export function canRecordVoice(): boolean {
  return recorderCtor() !== null && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

export function pickVoiceMimeType(): string | undefined {
  const ctor = recorderCtor();
  if (!ctor?.isTypeSupported) return undefined;
  return MIME_CANDIDATES.find((type) => ctor.isTypeSupported?.(type));
}

export type VoiceProblem = 'denied' | 'no-microphone' | 'failed';
export class VoiceRecordingError extends Error {
  constructor(readonly problem: VoiceProblem) { super(problem); }
}

export type VoiceRecording = { blob: Blob; durationMs: number };
export type VoiceSession = { stop: () => void; cancel: () => void; result: Promise<VoiceRecording> };

/** Starts a recording; `result` settles when `stop()` is called (or the stream ends). The microphone is always released. */
export async function startVoiceRecording(): Promise<VoiceSession> {
  const ctor = recorderCtor();
  if (!ctor || !navigator.mediaDevices?.getUserMedia) throw new VoiceRecordingError('failed');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    throw new VoiceRecordingError(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no-microphone' : name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed');
  }
  const mimeType = pickVoiceMimeType();
  const release = () => stream.getTracks().forEach((track) => track.stop());
  let recorder: MediaRecorder;
  try {
    recorder = new ctor(stream, mimeType ? { mimeType } : undefined);
  } catch {
    release();
    throw new VoiceRecordingError('failed');
  }
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  let cancelled = false;
  const result = new Promise<VoiceRecording>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) chunks.push(event.data); };
    recorder.onerror = () => { release(); reject(new VoiceRecordingError('failed')); };
    recorder.onstop = () => {
      release();
      if (cancelled) { reject(new VoiceRecordingError('failed')); return; }
      const type = (mimeType ?? recorder.mimeType ?? 'audio/webm').split(';')[0] || 'audio/webm';
      resolve({ blob: new Blob(chunks, { type }), durationMs: Date.now() - startedAt });
    };
  });
  result.catch(() => undefined);
  recorder.start();
  return {
    result,
    stop: () => { if (recorder.state !== 'inactive') recorder.stop(); },
    cancel: () => { cancelled = true; if (recorder.state !== 'inactive') recorder.stop(); else release(); },
  };
}

export const formatVoiceClock = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
