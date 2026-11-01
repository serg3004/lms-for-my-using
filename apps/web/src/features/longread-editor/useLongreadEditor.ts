import { useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../../shared/apiClient.js';
import { saveLongreadDraft, type LongreadDraft } from '../../shared/api/longreads.js';
import { documentValid, fromDraft, initialIds, savedIds, toSave, type EditorDocument } from './model.js';

type History = { past: EditorDocument[]; present: EditorDocument; future: EditorDocument[] };
export type SaveStatus = 'saved' | 'changed' | 'saving' | 'error' | 'conflict' | 'invalid';

/** Serial autosave. A response assigns server ids to the exact sent snapshot, never to later edits. */
export function useLongreadEditor(initial: LongreadDraft, paused = false) {
  const [history, setHistory] = useState<History>(() => ({ past: [], present: fromDraft(initial), future: [] }));
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [retry, setRetry] = useState(0);
  const present = useRef(history.present); present.current = history.present;
  const metadata = useRef({ revision: initial.revision, ids: initialIds(initial), saved: JSON.stringify(history.present) });
  const state = useRef<SaveStatus>('saved');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const dirty = JSON.stringify(history.present) !== metadata.current.saved;
  function change(update: (document: EditorDocument) => EditorDocument) {
    setHistory((previous) => {
      const next = { ...previous.present, ...update(previous.present) };
      if (JSON.stringify(next) === JSON.stringify(previous.present)) return previous;
      return { past: [...previous.past.slice(-79), previous.present], present: next, future: [] };
    });
  }
  function undo() { setHistory((h) => h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h); }
  function redo() { setHistory((h) => h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h); }
  useEffect(() => {
    if (paused || state.current === 'conflict' || state.current === 'saving' || (state.current === 'error' && retry === 0)) return;
    if (JSON.stringify(history.present) === metadata.current.saved) { state.current = 'saved'; setStatus('saved'); return; }
    if (!documentValid(history.present)) { state.current = 'invalid'; setStatus('invalid'); return; }
    state.current = 'changed'; setStatus('changed');
    const timer = window.setTimeout(() => {
      const sent = present.current;
      const revision = metadata.current.revision;
      state.current = 'saving'; setStatus('saving');
      void saveLongreadDraft(initial.lessonId, toSave(sent, revision, initial.settings, metadata.current.ids)).then((saved) => {
        if (!active.current) return;
        // A concurrent newer read-back must not be mistaken for the snapshot just saved.
        if (saved.revision !== revision + 1) { state.current = 'conflict'; setStatus('conflict'); return; }
        metadata.current = { revision: saved.revision, ids: savedIds(sent, saved), saved: JSON.stringify(sent) };
        const nextStatus = JSON.stringify(present.current) === metadata.current.saved ? 'saved' : 'changed';
        state.current = nextStatus; setStatus(nextStatus); setRetry(0);
      }).catch((error: unknown) => {
        if (!active.current) return;
        const next = error instanceof ApiClientError && error.status === 409 ? 'conflict' : 'error';
        state.current = next; setStatus(next); setRetry(0);
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [history.present, initial.lessonId, initial.settings, retry, status, paused]);
  return { document: history.present, change, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    revision: () => metadata.current.revision,
    adoptRevision: (revision: number) => { metadata.current.revision = revision; setRetry((n) => n + 1); },
    serverId: (key: string) => metadata.current.ids.get(key),
    status, dirty, retry: () => { state.current = 'changed'; setRetry((n) => n + 1); },
    recovery: () => JSON.stringify({ lessonId: initial.lessonId, schemaVersion: initial.schemaVersion, ...toSave(present.current, metadata.current.revision, initial.settings, metadata.current.ids) }, null, 2) };
}
