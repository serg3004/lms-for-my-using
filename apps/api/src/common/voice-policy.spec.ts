import { combineMode, effectiveVoice, type VoicePolicy } from './voice-policy.js';

const policy: VoicePolicy = { dictationEnabled: true, voiceNotesEnabled: false, maxSeconds: 60, perComment: 2, version: 3 };

describe('voice policy (PR 511)', () => {
  it('follows the organization when the checklist says inherit', () => {
    expect(effectiveVoice(policy, { dictationMode: 'inherit', voiceNotesMode: 'inherit' })).toEqual({ dictation: true, voiceNotes: false, maxSeconds: 60, perComment: 2 });
    expect(effectiveVoice(policy, {})).toMatchObject({ dictation: true, voiceNotes: false });
  });

  it('lets a checklist turn a mode off but never on against the organization', () => {
    expect(combineMode(true, 'off')).toBe(false);
    expect(combineMode(false, 'on')).toBe(false);
    expect(combineMode(true, 'on')).toBe(true);
    expect(effectiveVoice({ ...policy, voiceNotesEnabled: true }, { voiceNotesMode: 'off', dictationMode: 'off' })).toMatchObject({ voiceNotes: false, dictation: false });
  });
});
