// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_VOICE_SETTINGS, useVoiceSettings, type ChecklistVoiceApi } from './checklistVoice.js';
import type { ChecklistVoiceSettings } from '../shared/api/checklists.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); });

async function read(api: Pick<ChecklistVoiceApi, 'settings'> | undefined) {
  let value: ChecklistVoiceSettings | undefined;
  function Probe() { value = useVoiceSettings(api, 'i1'); return null; }
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root?.render(<Probe />));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  return value;
}

describe('useVoiceSettings (PR 511)', () => {
  it('offers dictation but no recording until the server says otherwise', async () => {
    expect(DEFAULT_VOICE_SETTINGS).toEqual({ dictation: true, voiceNotes: false, maxSeconds: 120, perComment: 3 });
    expect(await read(undefined)).toEqual(DEFAULT_VOICE_SETTINGS);
  });

  it('takes what the server allows', async () => {
    const settings = vi.fn(async () => ({ dictation: false, voiceNotes: true, maxSeconds: 45, perComment: 2 }));
    expect(await read({ settings })).toEqual({ dictation: false, voiceNotes: true, maxSeconds: 45, perComment: 2 });
    expect(settings).toHaveBeenCalledWith('i1');
  });

  it('keeps the defaults when the call fails, also a kiosk session that is not allowed to ask', async () => {
    expect(await read({ settings: vi.fn(async () => { throw new Error('403'); }) })).toEqual(DEFAULT_VOICE_SETTINGS);
    expect(await read({ settings: () => { throw new Error('sync'); } })).toEqual(DEFAULT_VOICE_SETTINGS);
  });
});
