import { useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { TFunction } from 'i18next';

import type { ChecklistInstanceStatus } from '../shared/api/types.js';
import { plainText } from '../shared/RichText.js';

/**
 * PR 450: the learner's list of sheets is split into «Assigned» (not finished yet) and «Completed» (finished, sent for review or expired),
 * with a search by title. The tab lives in the address (`#completed`), «Assigned» is the default. Inline styles only (the CSS budget is spent).
 */
export type LearnerListTab = 'assigned' | 'completed';

const DONE: ChecklistInstanceStatus[] = ['completed', 'submitted', 'expired'];

/** A row with an unfinished attempt, or a free sheet not started yet, is assigned; a finished or expired attempt is completed. */
export function learnerRowTab(row: { instance?: { status: ChecklistInstanceStatus } }): LearnerListTab {
  return row.instance && DONE.includes(row.instance.status) ? 'completed' : 'assigned';
}

export function tabFromHash(hash: string): LearnerListTab {
  return hash === '#completed' ? 'completed' : 'assigned';
}

/** Case-insensitive match of the query against the title without markup. */
export function matchesSearch(title: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === '' || plainText(title).toLowerCase().includes(needle);
}

const COLORS = { text: '#172033', muted: '#6b7280', border: '#e3e8ef', primary: '#4f46e5' };

export function LearnerChecklistFilters({ tab, counts, query, onTab, onQuery, t }: {
  tab: LearnerListTab; counts: Record<LearnerListTab, number>; query: string;
  onTab: (tab: LearnerListTab) => void; onQuery: (query: string) => void; t: TFunction;
}) {
  const id = useId();
  const refs = useRef<Record<LearnerListTab, HTMLButtonElement | null>>({ assigned: null, completed: null });
  const tabs: { key: LearnerListTab; label: string }[] = [
    { key: 'assigned', label: t('checklists.all.tabs.assigned', 'Assigned') },
    { key: 'completed', label: t('checklists.all.tabs.completed', 'Completed') },
  ];
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next: LearnerListTab = event.key === 'ArrowLeft' || event.key === 'Home' ? 'assigned' : 'completed';
    onTab(next);
    refs.current[next]?.focus();
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 16, borderBottom: `1px solid ${COLORS.border}` }}>
      <div role="tablist" aria-label={t('checklists.all.tabs.label', 'My checklists')} onKeyDown={onKeyDown} style={{ display: 'flex', gap: 2 }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            ref={(element) => { refs.current[key] = element; }}
            id={`${id}-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => onTab(key)}
            style={{ border: 'none', borderBottom: `2px solid ${tab === key ? COLORS.primary : 'transparent'}`, background: 'none', color: tab === key ? COLORS.primary : COLORS.muted, padding: '9px 12px 11px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 44 }}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>
      <label style={{ flex: '1 1 200px', maxWidth: 320, marginBottom: 6 }}>
        <span className="ui-visually-hidden">{t('checklists.all.search.label', 'Search checklists')}</span>
        <input
          type="search"
          value={query}
          placeholder={t('checklists.all.search.placeholder', 'Search…')}
          onChange={(event) => onQuery(event.target.value)}
          style={{ width: '100%', minHeight: 44, boxSizing: 'border-box' }}
        />
      </label>
    </div>
  );
}
