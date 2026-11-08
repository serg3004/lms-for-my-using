import { useId } from 'react';
import type { TFunction } from 'i18next';

import { checklistLabel } from '@lms/shared/checklist-numbering';
import type { ChecklistScoringMode } from './api/types.js';
import { DEFAULT_LEVEL_COLORS, defaultLevelColor, levelPaint, NEUTRAL_LEVEL_COLOR } from './levelPaint.js';
import { RichDescription } from './RichDescription.js';
import { Button } from './ui.js';

/**
 * PR 448: the answer area of one criterion, the same in the preview, in the sheet a learner fills in and in a session an observer conducts.
 * Options are a list with radios; the chosen one is washed with its level colour (own colour, else the default by score) and keeps a tick
 * and a thick border besides; choosing the chosen one again, or "Clear answer", takes the answer back. Inline styles only (the CSS budget is spent).
 */
export type CriterionOption = { key: number; label: string; description?: string; points: number; color?: string };

/** The built-in Yes / No of a sheet without a scale: key 1 = Yes (checked), key 0 = No (explicitly not done). */
export function yesNoOptions(t: TFunction, points: number): CriterionOption[] {
  return [
    { key: 1, label: t('checklistPreview.yes', 'Yes'), points, color: DEFAULT_LEVEL_COLORS.full },
    { key: 0, label: t('checklistPreview.no', 'No'), points: 0, color: DEFAULT_LEVEL_COLORS.zero },
  ];
}

export function CriterionOptions({ text, number, required, options, selectedKey, scoringMode, disabled = false, canClear, clearLabel, onChoose, onClear }: {
  text: string; number: string; required: boolean;
  options: CriterionOption[]; selectedKey: number | null; scoringMode: ChecklistScoringMode;
  disabled?: boolean; canClear: boolean; clearLabel: string;
  onChoose: (key: number) => void; onClear: () => void;
}) {
  const name = useId();
  const bestPoints = Math.max(0, ...options.map((option) => option.points));
  return <>
    <div role="radiogroup" aria-required={required} aria-label={checklistLabel(text, number)} style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
      {options.map((option) => {
        const selected = selectedKey === option.key;
        const paint = selected ? levelPaint(scoringMode === 'none' ? NEUTRAL_LEVEL_COLOR : option.color ?? defaultLevelColor(option.points, bestPoints)) : null;
        return <label key={option.key} data-selected={selected || undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: disabled ? 'default' : 'pointer', boxSizing: 'border-box', padding: '4px 10px', borderRadius: 10, borderWidth: 2, borderStyle: 'solid', borderColor: 'transparent', ...paint, fontWeight: selected ? 600 : undefined }}>
          <input type="radio" style={{ width: 'auto', flex: 'none' }} name={name} checked={selected} disabled={disabled}
            onClick={() => { if (selected) onClear(); }}
            onChange={() => onChoose(option.key)} />
          <span style={{ flex: 1 }}>{option.label}{option.description && <span style={{ display: 'block' }}><RichDescription value={option.description} /></span>}</span>
          {selected && <span aria-hidden="true">✓</span>}
        </label>;
      })}
    </div>
    {canClear && <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onClear}>{clearLabel}</Button>}
  </>;
}
