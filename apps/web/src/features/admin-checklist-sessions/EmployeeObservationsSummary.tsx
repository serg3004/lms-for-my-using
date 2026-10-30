import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { listChecklistSessions } from '../../shared/api/checklistSessions.js';
import type { ChecklistSessionSummary } from '../../shared/api/types.js';
import { formatDate } from '../../shared/formatDate.js';
import { ChecklistSummaryExport } from './ChecklistSummaryExport.js';

const MAX_OBSERVATIONS = 50;

/** PR 375: the employee's other completed observations of this sheet, picked by date for one summary file. */
export function EmployeeObservationsSummary({ session, t }: { session: ChecklistSessionSummary; t: TFunction }) {
  const [sessions, setSessions] = useState<ChecklistSessionSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set([session.id]));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    listChecklistSessions({ status: 'completed', checklistId: session.checklist.id, learnerId: session.learner.id, pageSize: 100 })
      .then((page) => {
        if (!active) return;
        const items = [session, ...page.items.filter((item) => item.id !== session.id)]
          .sort((a, b) => (a.startedAt ?? a.scheduledAt ?? '').localeCompare(b.startedAt ?? b.scheduledAt ?? ''));
        setSessions(items.slice(0, MAX_OBSERVATIONS));
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [session]);
  if (failed) return <span role="status">{t('admin.checklists.report.otherObservationsError', 'Unable to load other observations.')}</span>;
  if (!sessions || sessions.length < 2) return null;
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    setSelected(next);
  };
  const ids = sessions.filter((item) => selected.has(item.id)).map((item) => item.id);
  return (
    <details className="admin-card">
      <summary>{t('admin.checklists.report.otherObservations', 'Summary with other observations of this employee')}</summary>
      <fieldset>
        <legend>{t('admin.checklists.report.otherObservationsHint', 'Choose the observation dates to include in one file.')}</legend>
        {sessions.map((item) => {
          const moment = item.startedAt ?? item.scheduledAt;
          const date = moment ? formatDate(moment, undefined, { dateStyle: 'medium', timeZone: item.timezone }) : '—';
          return (
            <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
              <input checked={selected.has(item.id)} onChange={(event) => toggle(item.id, event.target.checked)} type="checkbox" />
              {date}{item.id === session.id ? ` — ${t('admin.checklists.report.currentObservation', 'this session')}` : ''}
            </label>
          );
        })}
      </fieldset>
      <ChecklistSummaryExport sessionIds={ids} disabled={false} t={t} />
    </details>
  );
}
