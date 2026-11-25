import { describe, expect, it } from 'vitest';

import { dictationLanguage, dictationProblem, recognitionClass, recognitionTag, splitTranscript } from './dictation.js';

describe('dictation helpers (PR 508)', () => {
  it('finds the recognition class of the browser, with or without the prefix, and none in Firefox', () => {
    class Fake {}
    expect(recognitionClass({ SpeechRecognition: Fake })).toBe(Fake);
    expect(recognitionClass({ webkitSpeechRecognition: Fake })).toBe(Fake);
    expect(recognitionClass({})).toBeNull();
    expect(recognitionClass(undefined)).toBeNull();
  });

  it('takes the dictation language from the interface language and falls back to Russian', () => {
    expect(dictationLanguage('kk')).toBe('kk');
    expect(dictationLanguage('zh-CN')).toBe('zh');
    expect(dictationLanguage('EN-us')).toBe('en');
    expect(dictationLanguage('de')).toBe('ru');
    expect(dictationLanguage(undefined)).toBe('ru');
    expect(recognitionTag('kk')).toBe('kk-KZ');
  });

  it('turns recognition errors into what the person has to do, and ignores a stop on purpose', () => {
    expect(dictationProblem('not-allowed')).toBe('denied');
    expect(dictationProblem('service-not-allowed')).toBe('denied');
    expect(dictationProblem('audio-capture')).toBe('no-microphone');
    expect(dictationProblem('network')).toBe('network');
    expect(dictationProblem('language-not-supported')).toBe('language');
    expect(dictationProblem('no-speech')).toBe('silence');
    expect(dictationProblem('aborted')).toBeNull();
    expect(dictationProblem('something-new')).toBe('failed');
  });

  it('splits a result into finished text and the part still being recognised, from the first changed result', () => {
    const result = (transcript: string, isFinal: boolean) => Object.assign([{ transcript }], { isFinal, length: 1 });
    const results = Object.assign([result('привет', true), result('мир ещё', false)], { length: 2 });
    expect(splitTranscript({ resultIndex: 0, results })).toEqual({ final: 'привет', interim: 'мир ещё' });
    expect(splitTranscript({ resultIndex: 1, results })).toEqual({ final: '', interim: 'мир ещё' });
  });
});
