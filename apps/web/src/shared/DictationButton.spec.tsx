// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DictationButton } from './DictationButton.js';
import type { SpeechRecognitionLike } from './dictation.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeRecognition implements SpeechRecognitionLike {
  lang = ''; continuous = false; interimResults = false;
  onresult: SpeechRecognitionLike['onresult'] = null; onerror: SpeechRecognitionLike['onerror'] = null; onend: SpeechRecognitionLike['onend'] = null;
  started = false; aborted = false;
  static last: FakeRecognition | undefined;
  constructor() { FakeRecognition.last = this; }
  start() { this.started = true; }
  stop() { this.started = false; this.onend?.(); }
  abort() { this.aborted = true; }
  say(final: string, interim = '') {
    const make = (transcript: string, isFinal: boolean) => Object.assign([{ transcript }], { isFinal, length: 1 });
    const list = [make(final, true), ...(interim ? [make(interim, false)] : [])];
    this.onresult?.({ resultIndex: 0, results: Object.assign(list, { length: list.length }) } as never);
  }
}

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLElement;
const onText = vi.fn();

async function render(disabled = false) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(<DictationButton disabled={disabled} id="note" onText={onText} />); });
}
const button = () => host.querySelector('#note-dictation') as HTMLButtonElement;
const click = async (element: Element) => { await act(async () => { (element as HTMLElement).click(); }); };

beforeEach(async () => {
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
  onText.mockReset();
});

describe('DictationButton (PR 508)', () => {
  it('shows nothing where the browser cannot recognise speech', async () => {
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    await render();
    expect(host.innerHTML).toBe('');
  });

  it('records in the interface language, hands over every finished phrase and stops on the second press', async () => {
    await render();
    expect(button().textContent).toContain('Диктовать');
    await click(button());
    expect(FakeRecognition.last?.started).toBe(true);
    expect(FakeRecognition.last?.lang).toBe('ru-RU');
    expect(FakeRecognition.last?.continuous).toBe(true);
    expect(FakeRecognition.last?.interimResults).toBe(true);
    expect(button().textContent).toContain('Остановить');
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Запись идёт, говорите');

    await act(async () => { FakeRecognition.last?.say('первая фраза', 'вторая ещё'); });
    expect(onText).toHaveBeenCalledWith('первая фраза');
    expect(host.textContent).toContain('вторая ещё');

    await click(button());
    expect(FakeRecognition.last?.started).toBe(false);
    expect(button().textContent).toContain('Диктовать');
    // Something was heard, so stopping is not a "nothing heard" problem.
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('says the speech is processed by the browser once, and not again', async () => {
    await render();
    await click(button());
    expect(host.querySelector('[role="note"]')?.textContent).toContain('браузер');
    await click(button());
    expect(host.querySelector('[role="note"]')).toBeNull();
    await click(button());
    expect(host.querySelector('[role="note"]')).toBeNull();
  });

  it('keeps the chosen language and uses it for the next recording', async () => {
    await render();
    const select = host.querySelector('select') as HTMLSelectElement;
    await act(async () => { select.value = 'kk'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(button());
    expect(FakeRecognition.last?.lang).toBe('kk-KZ');
    expect(window.localStorage.getItem('lms.dictation.language')).toBe('kk');
  });

  it('explains a refused microphone and offers to try again', async () => {
    await render();
    await click(button());
    await act(async () => { FakeRecognition.last?.onerror?.({ error: 'not-allowed' }); FakeRecognition.last?.onend?.(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Нет доступа к микрофону');
    expect(host.textContent).toContain('Повторить');
    await click(button());
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('says nothing was heard when the recording ends without speech', async () => {
    await render();
    await click(button());
    await click(button());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Ничего не слышно');
  });

  it('is off while the field is read-only and stops with the screen', async () => {
    await render(true);
    expect(button().disabled).toBe(true);
    await act(async () => { root?.unmount(); });
    root = undefined;
    document.body.innerHTML = '';
    await render();
    await click(button());
    await act(async () => { root?.unmount(); });
    root = undefined;
    expect(FakeRecognition.last?.aborted).toBe(true);
  });
});
