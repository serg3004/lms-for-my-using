import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * PR 508: dictation (speech to text) through the speech recognition built into the browser (Web Speech API). Nothing is sent to our
 * servers and no sound is kept: the browser's own provider turns the speech into text. Chrome, Edge and Safari have it, Firefox does not.
 */

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; length: number; [index: number]: RecognitionAlternative };
type RecognitionEvent = { resultIndex: number; results: { length: number; [index: number]: RecognitionResult } };
type RecognitionErrorEvent = { error: string };
export type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type RecognitionClass = new () => SpeechRecognitionLike;

export const DICTATION_LANGUAGES = ['ru', 'en', 'kk', 'zh'] as const;
export type DictationLanguage = (typeof DICTATION_LANGUAGES)[number];
const BCP47: Record<DictationLanguage, string> = { ru: 'ru-RU', en: 'en-US', kk: 'kk-KZ', zh: 'zh-CN' };

/** The recognition class of the browser, or null where there is none (Firefox, old browsers). */
export function recognitionClass(scope: { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown } | undefined = typeof window === 'undefined' ? undefined : (window as never)): RecognitionClass | null {
  const found = scope?.SpeechRecognition ?? scope?.webkitSpeechRecognition;
  return typeof found === 'function' ? (found as RecognitionClass) : null;
}

/** The dictation language for an interface language code (`ru`, `kk-KZ`...); Russian when it is none of the four. */
export function dictationLanguage(code: string | undefined): DictationLanguage {
  const base = (code ?? '').toLowerCase().split('-')[0];
  return (DICTATION_LANGUAGES as readonly string[]).includes(base ?? '') ? (base as DictationLanguage) : 'ru';
}
export const recognitionTag = (language: DictationLanguage) => BCP47[language];

export type DictationProblem = 'denied' | 'no-microphone' | 'network' | 'language' | 'failed' | 'silence';

/** What a recognition error code means for the person; `null` for the ones that are not a problem (a stop on purpose). */
export function dictationProblem(code: string): DictationProblem | null {
  switch (code) {
    case 'aborted': return null;
    case 'not-allowed':
    case 'service-not-allowed': return 'denied';
    case 'audio-capture': return 'no-microphone';
    case 'network': return 'network';
    case 'language-not-supported': return 'language';
    case 'no-speech': return 'silence';
    default: return 'failed';
  }
}

/** The text of the finished parts of a recognition result, in order, and the part still being recognised. */
export function splitTranscript(event: RecognitionEvent): { final: string; interim: string } {
  let final = '';
  let interim = '';
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const text = result?.[0]?.transcript ?? '';
    if (result?.isFinal) final += text; else interim += text;
  }
  return { final: final.trim(), interim: interim.trim() };
}

const HINT_KEY = 'lms.dictation.hint-seen';
const LANGUAGE_KEY = 'lms.dictation.language';
export function readStored(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
export function writeStored(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* storage may be blocked; the page works without it */ }
}
export { HINT_KEY, LANGUAGE_KEY };

export type Dictation = {
  supported: boolean;
  listening: boolean;
  /** Seconds since the recording began. */
  seconds: number;
  /** The words still being recognised (not yet in the text). */
  interim: string;
  problem: DictationProblem | null;
  start: () => void;
  stop: () => void;
};

/** One dictation session at a time: `onText` gets every finished phrase. Stops when the component goes away. */
export function useDictation({ language, onText }: { language: DictationLanguage; onText: (text: string) => void }): Dictation {
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [interim, setInterim] = useState('');
  const [problem, setProblem] = useState<DictationProblem | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const heard = useRef(false);
  const failed = useRef(false);
  const latest = useRef(onText);
  useEffect(() => { latest.current = onText; });
  const supported = recognitionClass() !== null;

  useEffect(() => {
    if (!listening) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [listening]);
  useEffect(() => () => { recognition.current?.abort(); }, []);

  const start = useCallback(() => {
    const Recognition = recognitionClass();
    if (!Recognition || recognition.current) return;
    const next = new Recognition();
    next.lang = BCP47[language];
    next.continuous = true;
    next.interimResults = true;
    heard.current = false;
    failed.current = false;
    next.onresult = (event) => {
      const { final, interim: rest } = splitTranscript(event);
      if (final) { heard.current = true; latest.current(final); }
      setInterim(rest);
    };
    next.onerror = (event) => {
      const kind = dictationProblem(event.error);
      if (kind) { failed.current = true; setProblem(kind); }
    };
    next.onend = () => {
      recognition.current = null;
      setListening(false);
      setInterim('');
      if (!heard.current && !failed.current) setProblem('silence');
    };
    recognition.current = next;
    setProblem(null);
    setSeconds(0);
    setInterim('');
    try {
      next.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setProblem('failed');
    }
  }, [language]);

  const stop = useCallback(() => { recognition.current?.stop(); }, []);
  return { supported, listening, seconds, interim, problem, start, stop };
}

/** PR 512: adds dictated text to the end of a plain text field (a space between), within the field's length limit. */
export function appendDictation(current: string, text: string, maxLength?: number): string {
  const spoken = text.trim();
  if (!spoken) return current;
  const joined = current && !/\s$/.test(current) ? `${current} ${spoken}` : `${current}${spoken}`;
  return maxLength !== undefined && joined.length > maxLength ? current : joined;
}
