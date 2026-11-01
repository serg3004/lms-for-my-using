// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LongreadReaderDocument } from '../../shared/api/longreads.js';

const api = vi.hoisted(() => ({ getPublishedLongread: vi.fn(), completeLongreadChapter: vi.fn() }));
vi.mock('../../shared/api/longreads.js', () => api);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { CompletionRuntime, useCompletion } from './CompletionRuntime.js';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const document = (): LongreadReaderDocument => ({
  lessonId: 'lesson-a', version: 1, preview: false, schemaVersion: 1,
  settings: { readingOrder: 'free', requiredChapters: 0, tableOfContents: 'off', direction: 'ltr', allowCopy: true },
  chapters: [], navigation: { chapter: 'first', headingIndex: null, allowedAnchors: ['first', 'second'], previousAnchor: null, nextAnchor: 'second' },
  completion: { version: 1, percentage: 0, completed: false, requiredCount: 1, completedCount: 0, chapters: [] },
});
let runtime: ReturnType<typeof useCompletion>, root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const onUpdate = vi.fn();
function Probe() { runtime = useCompletion(); return null; }
async function render(data: LongreadReaderDocument) {
  await act(async () => { root.render(<CompletionRuntime data={data} onUpdate={onUpdate}><Probe /></CompletionRuntime>); });
}
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = window.document.createElement('div'); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('completion request races (PR 392)', () => {
  it.each(['lesson', 'version', 'chapter'] as const)('ignores a late refresh failure after changing %s', async (scope) => {
    const pending = deferred<LongreadReaderDocument>(); api.getPublishedLongread.mockReturnValue(pending.promise);
    const data = document(); await render(data);
    let request!: Promise<void>; await act(async () => { request = runtime!.refresh(); });
    const next = structuredClone(data);
    if (scope === 'lesson') next.lessonId = 'lesson-b';
    else if (scope === 'version') { next.version = 2; next.completion!.version = 2; }
    else next.navigation.chapter = 'second';
    await render(next);
    await act(async () => { pending.reject(new Error('Old request failed')); await request; });
    expect(container.querySelector('[role="alert"]')).toBeNull(); expect(onUpdate).not.toHaveBeenCalled();
  });

  it('does not let an older failed refresh overwrite a newer successful check', async () => {
    const older = deferred<LongreadReaderDocument>(), newer = deferred<LongreadReaderDocument>();
    api.getPublishedLongread.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const data = document(); await render(data);
    let first!: Promise<void>, second!: Promise<void>;
    await act(async () => { first = runtime!.refresh(); second = runtime!.refresh(); });
    await act(async () => { newer.resolve(data); await second; });
    await act(async () => { older.reject(new Error('Superseded request failed')); await first; });
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(data); expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('clears a displayed error when navigating to another chapter', async () => {
    api.getPublishedLongread.mockRejectedValueOnce(new Error('Current request failed'));
    const data = document(); await render(data);
    await act(async () => { await runtime!.refresh(); });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await render({ ...data, navigation: { ...data.navigation, chapter: 'second' } });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('ignores a late Continue/completion failure from a previous chapter', async () => {
    const pending = deferred<LongreadReaderDocument>(); api.completeLongreadChapter.mockReturnValue(pending.promise);
    const data = document(); await render(data);
    let request!: Promise<void>; await act(async () => { request = runtime!.action(); });
    await render({ ...data, navigation: { ...data.navigation, chapter: 'second' } });
    await act(async () => { pending.reject(new Error('Previous chapter completion failed')); await request; });
    expect(container.querySelector('[role="alert"]')).toBeNull(); expect(runtime!.busy).toBe(false); expect(onUpdate).not.toHaveBeenCalled();
  });
});
