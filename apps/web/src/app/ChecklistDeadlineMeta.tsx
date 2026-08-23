import type { ChecklistInstanceSummary } from '../shared/api/types.js';
import { formatChecklistDueAt, getChecklistDeadlineState } from './checklistDeadline.js';

export function ChecklistDeadlineMeta({ instance }: { instance: Pick<ChecklistInstanceSummary, 'status' | 'dueAt'> }) {
  const dueAt = formatChecklistDueAt(instance.dueAt);
  if (!dueAt) return null;

  const state = getChecklistDeadlineState(instance);
  const label = state === 'expired'
    ? `Expired · ${dueAt}`
    : state === 'due_soon'
      ? `Due soon · ${dueAt}`
      : `Due · ${dueAt}`;

  return (
    <span
      data-deadline-state={state}
      style={{
        display: 'inline-block',
        marginTop: 4,
        fontSize: 12,
        fontWeight: state === 'expired' || state === 'due_soon' ? 700 : 500,
        color: state === 'expired' ? '#b91c1c' : state === 'due_soon' ? '#b45309' : '#6b7280',
      }}
    >
      {label}
    </span>
  );
}
