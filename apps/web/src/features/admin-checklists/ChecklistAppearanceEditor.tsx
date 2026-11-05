import { useId, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import {
  APPEARANCE_BORDER_MAX, APPEARANCE_PADDINGS, APPEARANCE_PRESETS, APPEARANCE_RADII, appearanceLowContrast, blockCss, resolveBlockStyle, sanitizeAppearance,
  type Appearance, type BlockKind, type BlockStyle,
} from '@lms/shared/checklist-appearance';
import type { ChecklistItemGroup, ChecklistItemSummary } from '../../shared/api/types.js';
import { Button } from '../../shared/ui.js';

const KINDS: BlockKind[] = ['header', 'info', 'group', 'item'];
const OWN = 'own';
type Target = BlockKind | typeof OWN;
const DEFAULT_COLOR = '#172033', DEFAULT_BACKGROUND = '#FFFFFF', DEFAULT_BORDER = '#D9DEE7';
const row = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 } as const;

type Props = { value: Appearance | null; onChange: (value: Appearance | null) => void; groups: ChecklistItemGroup[]; items: ChecklistItemSummary[]; disabled: boolean; t: TFunction };

/** PR 422: block appearance with a live sample of the selected block. */
export function ChecklistAppearanceEditor({ value, onChange, groups, items, disabled, t }: Props) {
  const uid = useId();
  const [target, setTarget] = useState<Target>('header');
  const [ownId, setOwnId] = useState('');
  const overrides = value?.overrides ?? {};
  const label = (kind: Target) => t(`admin.checklists.appearance.kind.${kind}`);
  const style: BlockStyle = target === OWN ? (ownId ? (overrides[ownId] ?? {}) : {}) : (value?.blocks?.[target] ?? {});
  const effective = target === OWN ? resolveBlockStyle(value, 'item', ownId) : style;
  const lowContrast = appearanceLowContrast(effective);
  const ownedNames = useMemo(() => new Map<string, string>([...groups.map((group): [string, string] => [group.id, group.title]), ...items.map((item): [string, string] => [item.id, item.text])]), [groups, items]);
  const overriddenIds = Object.keys(overrides).filter((id) => ownedNames.has(id));

  function write(patch: Partial<Record<keyof BlockStyle, BlockStyle[keyof BlockStyle] | undefined>>) {
    const next = { ...style, ...patch } as Record<string, unknown>;
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    if (target === OWN) {
      if (!ownId) return;
      onChange(sanitizeAppearance({ blocks: value?.blocks, overrides: { ...overrides, [ownId]: next } }));
    } else {
      onChange(sanitizeAppearance({ blocks: { ...value?.blocks, [target]: next }, overrides }));
    }
  }
  const color = (key: 'color' | 'background' | 'borderColor', fallback: string, name: string) => (
    <div style={row}>
      <label htmlFor={`${uid}-${key}`} style={{ minWidth: 110 }}>{name}</label>
      <input id={`${uid}-${key}`} type="color" disabled={disabled || (target === OWN && !ownId)} value={style[key] ?? fallback} style={{ width: 44, height: 32, padding: 0 }}
        onChange={(event) => write({ [key]: event.target.value.toUpperCase() })} />
      <Button type="button" size="sm" variant="ghost" disabled={disabled || !style[key]} onClick={() => write({ [key]: undefined })}>{t('admin.checklists.appearance.unset')}</Button>
    </div>
  );
  const choice = (key: 'borderWidth' | 'radius' | 'padding', name: string, options: readonly number[]) => (
    <div style={row}>
      <label htmlFor={`${uid}-${key}`} style={{ minWidth: 110 }}>{name}</label>
      <select id={`${uid}-${key}`} disabled={disabled || (target === OWN && !ownId)} value={style[key] ?? ''} onChange={(event) => write({ [key]: event.target.value === '' ? undefined : Number(event.target.value) })}>
        <option value="">{t('admin.checklists.appearance.standard')}</option>
        {options.map((option) => <option key={option} value={option}>{option} px</option>)}
      </select>
    </div>
  );
  return (
    <section aria-labelledby={`${uid}-title`} style={{ display: 'grid', gap: 10 }} data-testid="checklist-appearance">
      <h3 id={`${uid}-title`} style={{ margin: 0 }}>{t('admin.checklists.appearance.title')}</h3>
      <p className="admin-form__hint" style={{ margin: 0 }}>{t('admin.checklists.appearance.hint')}</p>
      <div style={row}>
        <span>{t('admin.checklists.appearance.presets')}</span>
        {(['strict', 'calm', 'contrast'] as const).map((preset) => (
          <Button key={preset} type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => onChange(sanitizeAppearance({ blocks: APPEARANCE_PRESETS[preset].blocks, overrides }))}>{t(`admin.checklists.appearance.preset.${preset}`)}</Button>
        ))}
        <Button type="button" size="sm" variant="ghost" disabled={disabled || !value} onClick={() => onChange(null)}>{t('admin.checklists.appearance.reset')}</Button>
      </div>
      <div role="tablist" aria-label={t('admin.checklists.appearance.title')} style={row}>
        {[...KINDS, OWN as Target].map((kind) => (
          <button key={kind} type="button" role="tab" aria-selected={target === kind} className="ds-button ds-button--secondary ds-button--sm" style={target === kind ? { outline: '2px solid var(--color-primary, #1D4ED8)' } : undefined} onClick={() => setTarget(kind)}>
            {label(kind)}{kind !== OWN && value?.blocks?.[kind] ? ' •' : ''}
          </button>
        ))}
      </div>
      {target === OWN && (
        <div style={row}>
          <label htmlFor={`${uid}-own`}>{t('admin.checklists.appearance.pickBlock')}</label>
          <select id={`${uid}-own`} value={ownId} disabled={disabled} onChange={(event) => setOwnId(event.target.value)}>
            <option value="">{t('admin.checklists.appearance.pickPlaceholder')}</option>
            <optgroup label={t('admin.checklists.appearance.kind.group')}>{groups.map((group) => <option key={group.id} value={group.id}>{group.title}{overrides[group.id] ? ' •' : ''}</option>)}</optgroup>
            <optgroup label={t('admin.checklists.appearance.kind.item')}>{items.map((item) => <option key={item.id} value={item.id}>{item.text}{overrides[item.id] ? ' •' : ''}</option>)}</optgroup>
          </select>
          <Button type="button" size="sm" variant="ghost" disabled={disabled || !ownId || !overrides[ownId]} onClick={() => onChange(sanitizeAppearance({ blocks: value?.blocks, overrides: Object.fromEntries(Object.entries(overrides).filter(([id]) => id !== ownId)) }))}>{t('admin.checklists.appearance.resetBlock')}</Button>
        </div>
      )}
      {target === OWN && overriddenIds.length > 0 && <p className="admin-form__hint" style={{ margin: 0 }}>{t('admin.checklists.appearance.overridden', { count: overriddenIds.length })}</p>}
      {color('color', DEFAULT_COLOR, t('admin.checklists.appearance.textColor'))}
      {color('background', DEFAULT_BACKGROUND, t('admin.checklists.appearance.background'))}
      {color('borderColor', DEFAULT_BORDER, t('admin.checklists.appearance.borderColor'))}
      {choice('borderWidth', t('admin.checklists.appearance.borderWidth'), Array.from({ length: APPEARANCE_BORDER_MAX + 1 }, (_, index) => index))}
      {choice('radius', t('admin.checklists.appearance.radius'), APPEARANCE_RADII)}
      {choice('padding', t('admin.checklists.appearance.padding'), APPEARANCE_PADDINGS)}
      {lowContrast && <p role="status" style={{ margin: 0, color: 'var(--color-danger, #B91C1C)' }}>{t('admin.checklists.appearance.lowContrast')}</p>}
      <div data-testid="checklist-appearance-sample" style={{ border: '1px solid var(--color-border)', borderRadius: 8, ...blockCss(effective) }}>
        <strong>{target === OWN && ownId ? ownedNames.get(ownId) : label(target)}</strong>
        <p style={{ margin: '4px 0 0' }}>{t('admin.checklists.appearance.sample')}</p>
      </div>
    </section>
  );
}
