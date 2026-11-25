// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpeechRecognitionLike } from '../shared/dictation.js';
import { RichFillField } from './ChecklistItemNote.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeRecognition implements SpeechRecognitionLike {
  lang = ''; continuous = false; interimResults = false;
  onresult: SpeechRecognitionLike['onresult'] = null; onerror: SpeechRecognitionLike['onerror'] = null; onend: SpeechRecognitionLike['onend'] = null;
  static last: FakeRecognition | undefined;
  constructor() { FakeRecognition.last = this; }
  start() {}
  stop() { this.onend?.(); }
  abort() {}
  say(final: string) {
    const list = [Object.assign([{ transcript: final }], { isFinal: true, length: 1 })];
    this.onresult?.({ resultIndex: 0, results: Object.assign(list, { length: 1 }) } as never);
  }
}

const changes: string[] = [];
function Harness({ initial = '', maxLength = 1000, dictation = true, disabled = false }: { initial?: string; maxLength?: number; dictation?: boolean; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return <RichFillField dictation={dictation} disabled={disabled} id="note" label="Comment" maxLength={maxLength} onChange={(next) => { changes.push(next); setValue(next); }} value={value} />;
}

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLElement;
async function render(props: Parameters<typeof Harness>[0] = {}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(<Harness {...props} />); });
}
const dictate = async () => { await act(async () => { (host.querySelector('#note-dictation') as HTMLButtonElement).click(); }); };
const say = async (text: string) => { await act(async () => { FakeRecognition.last?.say(text); }); };

// jsdom has no layout; the editor asks the caret's node or range for rectangles when it scrolls it into view.
for (const proto of [Range.prototype, Text.prototype] as { getClientRects?: () => unknown; getBoundingClientRect?: () => unknown }[]) {
  if (!proto.getClientRects) proto.getClientRects = () => [];
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 });
}

beforeEach(async () => {
  changes.length = 0;
  FakeRecognition.last = undefined;
  window.localStorage.clear();
  await i18n.changeLanguage('ru');
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

describe('dictation into a comment field (PR 508)', () => {
  it('writes the phrases into the field as ordinary text, one after the other', async () => {
    await render();
    await dictate();
    await say('на кассе порядок');
    await say('но чек не выдали');
    expect(changes.at(-1)).toBe('на кассе порядок но чек не выдали');
  });

  it('adds to what is already typed and does not read the speech as markup', async () => {
    await render({ initial: '<p>Замечание</p>' });
    await dictate();
    await say('<b>жирный</b> & тест');
    expect(changes.at(-1)).toBe('<p>Замечание &lt;b&gt;жирный&lt;/b&gt; &amp; тест</p>');
  });

  it('does not write past the length limit and says so', async () => {
    await render({ maxLength: 10, initial: '<p>12345678</p>' });
    await dictate();
    await say('слишком длинная фраза');
    expect(changes).toEqual([]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('10');
  });

  it('shows no microphone button unless the field asks for it or the browser can recognise speech', async () => {
    await render({ dictation: false });
    expect(host.querySelector('#note-dictation')).toBeNull();
    await act(async () => { root?.unmount(); });
    document.body.innerHTML = '';
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    await render();
    expect(host.querySelector('#note-dictation')).toBeNull();
    expect(host.querySelector('[role="textbox"]')).not.toBeNull();
  });

  it('does nothing while the field is read-only', async () => {
    await render({ disabled: true });
    expect((host.querySelector('#note-dictation') as HTMLButtonElement).disabled).toBe(true);
    expect(vi.isMockFunction(FakeRecognition.last?.start)).toBe(false);
    expect(changes).toEqual([]);
  });
});
