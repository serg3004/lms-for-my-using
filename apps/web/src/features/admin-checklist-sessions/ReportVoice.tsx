import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';

import { ChecklistVoiceNotes } from '../../app/ChecklistVoiceNotes.js';
import type { ChecklistVoiceApi } from '../../app/checklistVoice.js';
import { getChecklistVoiceNoteBlob, listChecklistVoiceNotes, removeChecklistVoiceNote, uploadChecklistVoiceNote, type ChecklistVoiceNote } from '../../shared/api/checklists.js';

/** PR 512: in a report the recordings are only played; the server hands them over to the same people who may open the report. */
const reportVoiceApi: ChecklistVoiceApi = {
  list: (instanceId) => listChecklistVoiceNotes(instanceId),
  upload: (instanceId, itemId, blob, durationMs, replaceId, kind) => uploadChecklistVoiceNote(instanceId, itemId, blob, durationMs, replaceId, kind),
  blob: (instanceId, noteId) => getChecklistVoiceNoteBlob(instanceId, noteId),
  remove: (instanceId, noteId) => removeChecklistVoiceNote(instanceId, noteId),
};

const Notes = createContext<ChecklistVoiceNote[]>([]);

/** Loads the list of recordings once for the whole report, and only when the report says there are any. */
export function ReportVoiceProvider({ instanceId, active, children }: { instanceId: string; active: boolean; children: ReactNode }) {
  const [notes, setNotes] = useState<ChecklistVoiceNote[]>([]);
  useEffect(() => {
    if (!active) { setNotes([]); return undefined; }
    let alive = true;
    Promise.resolve()
      .then(() => listChecklistVoiceNotes(instanceId))
      .then((list) => { if (alive) setNotes(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) setNotes([]); });
    return () => { alive = false; };
  }, [instanceId, active]);
  return <Notes.Provider value={notes}>{children}</Notes.Provider>;
}

/** The recordings of one comment (an answer, a reviewer's comment or one closing text), with a caption for a reviewer's. */
export function ReportVoicePlayer({ instanceId, itemId, place, field, t }: {
  instanceId: string; itemId: string | null; place: ChecklistVoiceNote['place']; field?: string; t: TFunction;
}) {
  const all = useContext(Notes);
  const notes = all.filter((note) => note.place === place && note.itemId === itemId && (field === undefined || note.field === field));
  if (notes.length === 0) return null;
  return (
    <div style={{ marginTop: 6, minWidth: 0 }}>
      {place === 'reviewer_comment' && <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{t('admin.checklists.report.voiceReviewer', 'Reviewer’s recording')}</span>}
      <ChecklistVoiceNotes api={reportVoiceApi} editable={false} instanceId={instanceId} itemId={itemId} notes={notes} onChanged={() => undefined} t={t} />
    </div>
  );
}
