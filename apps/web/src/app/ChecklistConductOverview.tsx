import type { TFunction } from 'i18next';
import type { ChecklistItemGroup } from '../shared/api/types.js';
import { Badge, Button, PageState } from '../shared/ui.js';
import { conductOverviewGroups, type ConductCriterion } from './checklistConductOverview.js';

export function ChecklistConductOverview({ criteria, groups, hideAnswered, currentItemIndex, disabled, onSelect, t }: {
  criteria: ConductCriterion[];
  groups: ChecklistItemGroup[];
  hideAnswered: boolean;
  currentItemIndex: number;
  disabled: boolean;
  onSelect: (itemIndex: number) => void;
  t: TFunction;
}) {
  const visibleGroups = conductOverviewGroups(criteria, groups, hideAnswered);
  return <>
    {visibleGroups.length === 0 && <PageState message={hideAnswered
      ? t('checklistSessions.conduct.overviewEmpty', 'No unanswered criteria. Turn off the filter to see the full sheet.')
      : t('checklistSessions.conduct.overviewNoCriteria', 'This sheet has no criteria.')} />}
    {visibleGroups.map((group) => <section key={group.id ?? 'ungrouped'} style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 8px', overflowWrap: 'anywhere' }}>{group.title || t('checklistSessions.conduct.overviewUngrouped', 'Other criteria')}</h3>
      <ul style={{ display: 'grid', gap: 8, padding: 0, margin: 0, listStyle: 'none' }}>
        {group.criteria.map(({ item, index, state }) => <li key={item.id}>
          <Button type="button" variant="secondary" disabled={disabled} aria-current={index === currentItemIndex ? 'step' : undefined}
            onClick={() => onSelect(index)} style={{ width: '100%', minHeight: 44, whiteSpace: 'normal', textAlign: 'left', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere', flex: '1 1 160px' }}>{item.text}</span>
            <Badge variant={state === 'answered' ? 'success' : 'neutral'} style={{ color: 'var(--color-text)' }}>{t(`checklistSessions.conduct.answerStatus.${state}`, state)}</Badge>
          </Button>
        </li>)}
      </ul>
    </section>)}
  </>;
}
