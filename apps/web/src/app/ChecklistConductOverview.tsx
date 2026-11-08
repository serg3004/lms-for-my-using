import { checklistLabel, checklistNumbers } from '@lms/shared/checklist-numbering';
import type { TFunction } from 'i18next';
import type { ChecklistItemGroup } from '../shared/api/types.js';
import { Badge, Button, PageState } from '../shared/ui.js';
import { conductOverviewGroups, type ConductCriterion } from './checklistConductOverview.js';

export function ChecklistConductOverview({ criteria, groups, showNumbering = true, hideAnswered, currentItemIndex, disabled, onSelect, t }: {
  criteria: ConductCriterion[];
  groups: ChecklistItemGroup[];
  showNumbering?: boolean;
  hideAnswered: boolean;
  currentItemIndex: number;
  disabled: boolean;
  onSelect: (itemIndex: number) => void;
  t: TFunction;
}) {
  const numbering = checklistNumbers(criteria.map(({ item }) => item), groups);
  const visibleGroups = conductOverviewGroups(criteria, groups, hideAnswered);
  return <>
    {visibleGroups.length === 0 && <PageState message={hideAnswered
      ? t('checklistSessions.conduct.overviewEmpty', 'No unanswered criteria. Turn off the filter to see the full sheet.')
      : t('checklistSessions.conduct.overviewNoCriteria', 'This sheet has no criteria.')} />}
    {visibleGroups.map((group) => <section key={group.id ?? 'ungrouped'} style={{ marginTop: 16 }}>
      {/* PR 447: a sheet without groups lists its criteria at once, without an "Other criteria" title. */}
      {groups.length > 0 && <h3 style={{ fontSize: 14, margin: '0 0 8px', overflowWrap: 'anywhere' }}>{checklistLabel(group.title || t('checklistSessions.conduct.overviewUngrouped', 'Other criteria'), group.id ? numbering.groupNumbers.get(group.id) : undefined, showNumbering)}</h3>}
      <ul style={{ display: 'grid', gap: 8, padding: 0, margin: 0, listStyle: 'none' }}>
        {group.criteria.map(({ item, index, state }) => <li key={item.id}>
          <Button type="button" variant="secondary" disabled={disabled} aria-current={index === currentItemIndex ? 'step' : undefined}
            onClick={() => onSelect(index)} style={{ width: '100%', minHeight: 44, whiteSpace: 'normal', textAlign: 'left', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere', flex: '1 1 160px' }}>{checklistLabel(item.text, numbering.itemNumbers.get(item.id), showNumbering)}</span>
            <Badge variant={state === 'answered' ? 'success' : 'neutral'} style={{ color: 'var(--color-text)' }}>{t(`checklistSessions.conduct.answerStatus.${state}`, state)}</Badge>
          </Button>
        </li>)}
      </ul>
    </section>)}
  </>;
}
