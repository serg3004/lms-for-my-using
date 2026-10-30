// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../shared/apiClient.js';
import type { LongreadDraft } from '../../shared/api/longreads.js';
import { useLongreadEditor } from './useLongreadEditor.js';
const save = vi.hoisted(() => vi.fn());
vi.mock('../../shared/api/longreads.js', () => ({ saveLongreadDraft: save }));
const draft: LongreadDraft = { lessonId: 'lesson', revision: 1, schemaVersion: 1,
  settings: { readingOrder: 'free', requiredChapters: 0, tableOfContents: 'expanded', direction: 'ltr', allowCopy: true },
  chapters: [{ id: 'chapter', anchor: 'stable', title: 'Original', hidden: false, blocks: [] }],
};
let current: ReturnType<typeof useLongreadEditor>;
let root: Root, container: HTMLDivElement;
function Harness() { current = useLongreadEditor(draft); return null; }
async function tick() { await act(async () => { vi.advanceTimersByTime(901); }); }
async function edit(title: string) { await act(async () => current.change((doc) => ({ chapters: [{ ...doc.chapters[0]!, title }] }))); }
beforeEach(async () => {
  vi.useFakeTimers(); save.mockReset();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
describe('serial longread autosave', () => {
  it('keeps reader settings when a later block/chapter edit only changes chapters', async () => {
    save.mockImplementationOnce(async (_id, input) => ({ ...draft, revision: 2, settings: input.settings, chapters: [{ ...draft.chapters[0]!, title: 'Updated' }] }));
    await act(async () => current.change((doc) => ({ ...doc, settings: { ...draft.settings, direction: 'rtl', tableOfContents: 'off' } })));
    await edit('Updated'); await tick();
    expect(save.mock.calls[0]![1].settings).toMatchObject({ direction: 'rtl', tableOfContents: 'off' });
    expect(current.document.settings).toMatchObject({ direction: 'rtl', tableOfContents: 'off' });
    expect(current.status).toBe('saved');
  });
  it('debounces, serializes requests and retains typing that happened in flight', async () => {
    let resolve!: (value: LongreadDraft) => void;
    save.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    save.mockImplementationOnce(async (_id, input) => ({ ...draft, revision: 3, chapters: input.chapters.map((chapter: object) => ({ ...chapter, id: 'chapter', anchor: 'stable' })) }));
    await edit('Sent'); expect(current.status).toBe('changed'); await tick(); expect(save).toHaveBeenCalledTimes(1); expect(current.status).toBe('saving');
    await edit('Typed during request'); await tick(); expect(save).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ...draft, revision: 2, chapters: [{ ...draft.chapters[0]!, title: 'Sent' }] }));
    expect(current.document.chapters[0]!.title).toBe('Typed during request'); await tick();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![1]).toMatchObject({ revision: 2, chapters: [{ id: 'chapter', title: 'Typed during request' }] });
    expect(current.status).toBe('saved'); expect(current.dirty).toBe(false);
  });
  it('keeps edits recoverable and stops autosave on conflict, including after more typing', async () => {
    save.mockRejectedValue(new ApiClientError('Changed elsewhere', 409));
    await edit('My unreplaced edits'); await tick(); expect(current.status).toBe('conflict');
    await edit('Still my edits'); await tick(); expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(current.recovery())).toMatchObject({ revision: 1, chapters: [{ title: 'Still my edits' }] });
    expect(current.dirty).toBe(true);
  });
  it('does not silently retry an ambiguous network failure; retry uses the same revision', async () => {
    save.mockRejectedValueOnce(new Error('Network disconnected'));
    save.mockResolvedValueOnce({ ...draft, revision: 2, chapters: [{ ...draft.chapters[0]!, title: 'Keep' }] });
    await edit('Keep'); await tick(); expect(current.status).toBe('error'); await tick(); expect(save).toHaveBeenCalledTimes(1);
    await act(async () => current.retry()); await tick();
    expect(save.mock.calls.map((call) => call[1].revision)).toEqual([1, 1]); expect(current.status).toBe('saved');
  });
  it('undoes and redoes edits and does not send an empty chapter title', async () => {
    await edit(''); await tick(); expect(current.status).toBe('invalid'); expect(save).not.toHaveBeenCalled();
    await act(async () => current.undo()); expect(current.document.chapters[0]!.title).toBe('Original'); expect(current.status).toBe('saved');
    await act(async () => current.redo()); expect(current.document.chapters[0]!.title).toBe(''); expect(current.status).toBe('invalid');
  });
});
