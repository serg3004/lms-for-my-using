// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../shared/apiClient.js';
import type { ChecklistVoiceKind, ChecklistVoiceNote, ChecklistVoiceSettings } from '../shared/api/checklists.js';
import { ChecklistVoiceNotes } from './ChecklistVoiceNotes.js';
import { VOICE_HINT_KEY, type ChecklistVoiceApi } from './checklistVoice.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeRecorder {
  static last: FakeRecorder | undefined;
  static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus';
  state = 'inactive'; mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(readonly stream: unknown, readonly options?: { mimeType?: string }) { FakeRecorder.last = this; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['x'.repeat(50)], { type: 'audio/webm' }) }); this.onstop?.(); }
}

const t = i18n.t.bind(i18n) as never;
const note = (id: string): ChecklistVoiceNote => ({ id, itemId: 'item-1', place: 'answer', durationMs: 5000, sizeBytes: 50, createdBy: 'u', createdAt: '2026-11-25T10:00:00.000Z' });
const stopped = vi.fn();
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLElement;
let api: ChecklistVoiceApi;
let onChanged: ReturnType<typeof vi.fn>;

async function render(notes: ChecklistVoiceNote[] = [], editable = true, settings?: ChecklistVoiceSettings, extra: { itemId?: string | null; kind?: ChecklistVoiceKind } = {}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(<ChecklistVoiceNotes api={api} editable={editable} instanceId="inst" itemId={extra.itemId === undefined ? 'item-1' : extra.itemId} kind={extra.kind} notes={notes} onChanged={onChanged as never} settings={settings} t={t} />); });
}
const button = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(name)) as HTMLButtonElement | undefined;
const click = async (name: string) => { await act(async () => { button(name)?.click(); }); };
const record = async (ms = 1000) => {
  vi.setSystemTime(Date.now());
  await click('Записать звук');
  await act(async () => { vi.advanceTimersByTime(ms); });
  await click('Остановить запись');
};

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.localStorage.clear();
  await i18n.changeLanguage('ru');
  FakeRecorder.last = undefined;
  (window as unknown as Record<string, unknown>).MediaRecorder = FakeRecorder;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopped }] })) } });
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
  onChanged = vi.fn();
  api = { list: vi.fn(async () => []), upload: vi.fn(async () => note('new')), blob: vi.fn(async () => new Blob(['a'], { type: 'audio/webm' })), remove: vi.fn(async () => undefined) };
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  host?.remove();
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).MediaRecorder;
  vi.restoreAllMocks();
});

describe('ChecklistVoiceNotes (PR 510)', () => {
  it('draws nothing where the browser cannot record and nothing is saved', async () => {
    delete (window as unknown as Record<string, unknown>).MediaRecorder;
    await render();
    expect(host.textContent).toBe('');
  });

  it('records, lets the person listen, and sends it; the hint is shown once', async () => {
    await render();
    await record(2000);
    expect(host.querySelector('audio[aria-label="Новая запись, ещё не отправлена"]')).not.toBeNull();
    expect(host.textContent).toContain('Запись сохраняется в чек-листе');
    await click('Отправить');
    expect(api.upload).toHaveBeenCalledTimes(1);
    const args = (api.upload as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(args.slice(0, 2)).toEqual(['inst', 'item-1']);
    expect((args[2] as Blob).type).toBe('audio/webm');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(stopped).toHaveBeenCalled();
    expect(window.localStorage.getItem(VOICE_HINT_KEY)).toBe('1');
    await record(1000);
    expect(host.textContent).not.toContain('Запись сохраняется в чек-листе');
  });

  it('can record again and discard before sending', async () => {
    await render();
    await record();
    await click('Записать заново');
    expect(button('Остановить запись')).toBeDefined();
    await click('Остановить запись');
    await click('Отменить');
    expect(button('Записать звук')).toBeDefined();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('keeps the recording and offers a retry when the upload fails offline', async () => {
    (api.upload as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new ApiClientError('Upload failed', 0));
    await render();
    await record();
    await click('Отправить');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Нет соединения');
    expect(button('Отправить')).toBeDefined();
    await click('Отправить');
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('explains a finished check and a full comment', async () => {
    (api.upload as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new ApiClientError('closed', 400));
    await render();
    await record();
    await click('Отправить');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('больше нельзя менять');
  });

  it('says what to do without permission or without a microphone', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await render();
    await click('Записать звук');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Нет доступа к микрофону');
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotFoundError' }));
    await click('Повторить');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Микрофон не найден');
  });

  it('warns before the limit and stops at it', async () => {
    await render();
    await click('Записать звук');
    await act(async () => { vi.advanceTimersByTime(106_000); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Запись остановится через');
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(host.querySelector('audio[aria-label="Новая запись, ещё не отправлена"]')).not.toBeNull();
  });

  it('plays saved recordings with a speed control, deletes one, and stops offering at three', async () => {
    await render([note('a'), note('b'), note('c')]);
    await act(async () => { await Promise.resolve(); });
    expect(api.blob).toHaveBeenCalledTimes(3);
    expect(host.querySelectorAll('audio[controls]').length).toBe(3);
    expect(host.querySelectorAll('select').length).toBe(3);
    expect((button('Записать звук') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { (host.querySelector('button[aria-label="Удалить запись 2"]') as HTMLButtonElement).click(); });
    expect(api.remove).toHaveBeenCalledWith('inst', 'b');
    expect(onChanged).toHaveBeenCalled();
  });

  it('is read-only once the check can no longer be edited', async () => {
    await render([note('a')], false);
    expect(button('Записать звук')).toBeUndefined();
    expect(button('Удалить')).toBeUndefined();
  });
});

describe('ChecklistVoiceNotes: organization and checklist settings (PR 511)', () => {
  const allowed: ChecklistVoiceSettings = { dictation: true, voiceNotes: true, maxSeconds: 30, perComment: 2 };

  it('draws nothing when recording is off and nothing is saved', async () => {
    await render([], true, { ...allowed, voiceNotes: false });
    expect(host.textContent).toBe('');
  });

  it('keeps saved recordings listenable and removable but offers no recording when it is off', async () => {
    await render([note('a')], true, { ...allowed, voiceNotes: false });
    expect(host.querySelectorAll('audio').length).toBeGreaterThan(0);
    expect(button('Записать звук')).toBeUndefined();
    expect(button('Удалить')).toBeDefined();
  });

  it('uses the limit of recordings per comment from the settings', async () => {
    await render([note('a'), note('b')], true, allowed);
    expect(button('Записать звук')?.disabled).toBe(true);
    expect(host.textContent).toContain('уже 2');
  });

  it('shows the longest length from the settings next to the timer', async () => {
    await render([], true, allowed);
    await click('Записать звук');
    expect(host.textContent).toContain('/ 0:30');
  });

  it('sends where the recording belongs: a reviewer comment, or a closing text without a criterion (PR 512)', async () => {
    await render([], true, undefined, { kind: { place: 'reviewer_comment' } });
    await record();
    await click('Отправить');
    expect(api.upload).toHaveBeenCalledWith('inst', 'item-1', expect.any(Blob), expect.any(Number), undefined, { place: 'reviewer_comment' });
    await act(async () => { root?.unmount(); });
    host.remove();
    await render([], true, undefined, { itemId: null, kind: { place: 'summary', field: 'strengths' } });
    await record();
    await click('Отправить');
    expect(api.upload).toHaveBeenLastCalledWith('inst', null, expect.any(Blob), expect.any(Number), undefined, { place: 'summary', field: 'strengths' });
    expect(host.querySelector('#voice-strengths-summary')).not.toBeNull();
  });
});
