import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { TFunction } from 'i18next';
import {
  APPEARANCE_BORDER_MAX, APPEARANCE_PADDINGS, APPEARANCE_PRESETS, APPEARANCE_RADII, appearanceLowContrast, resolveBlockStyle, sanitizeAppearance,
  type Appearance, type BlockKind, type BlockStyle,
} from '@lms/shared/checklist-appearance';

/** PR 431: the block of the editor whose look is being set: a header, "General information", a group or a criterion. */
export type BlockTarget = { kind: BlockKind; id: string | null; name: string };
export const sameTarget = (a: BlockTarget | null, b: BlockTarget | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;

const READY_COLORS = ['#172033', '#FFFFFF', '#F3F4F6', '#EAF2FB', '#F1F7EE', '#FFF7CC', '#1D4ED8', '#B91C1C'] as const;
const DEFAULT_COLOR = '#172033', DEFAULT_BACKGROUND = '#FFFFFF', DEFAULT_BORDER = '#D9DEE7';
const PANEL_WIDTH = 340;
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 };
const heading: CSSProperties = { margin: 0, fontSize: 14 };
const step: CSSProperties = { minWidth: 44, minHeight: 44 };

/** True on a phone-width screen; the settings come up from the bottom there. */
export function useNarrowScreen() {
  const query = '(max-width: 640px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query), update = () => setNarrow(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return narrow;
}

/** The "sliders" button on a block of the editor. */
export function BlockGear({ target, active, onOpen, t }: { target: BlockTarget; active: boolean; onOpen: (target: BlockTarget, trigger: HTMLElement) => void; t: TFunction }) {
  const label = t('admin.checklists.appearance.openFor', 'Block look: {{name}}', { name: target.name });
  return (
    <button type="button" className="admin-btn admin-btn--sm" aria-haspopup="dialog" aria-expanded={active} aria-label={label} title={label} style={{ minWidth: 44, minHeight: 44 }} onClick={(event) => onOpen(target, event.currentTarget)}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" />
      </svg>
    </button>
  );
}

type Scope = 'kind' | 'own';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section style={{ display: 'grid', gap: 8 }}><h4 style={heading}>{title}</h4>{children}</section>;
}

function ColorField({ label, value, fallback, disabled, onPick, t }: { label: string; value: string | undefined; fallback: string; disabled: boolean; onPick: (value: string | undefined) => void; t: TFunction }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'grid', gap: 6 }}>
      <span>{label}</span>
      <div style={row}>
        {READY_COLORS.map((color) => (
          <button key={color} type="button" disabled={disabled} aria-label={`${label} ${color}`} aria-pressed={value?.toUpperCase() === color} onClick={() => onPick(color)}
            style={{ width: 32, height: 32, minHeight: 32, borderRadius: '50%', padding: 0, background: color, cursor: 'pointer', border: value?.toUpperCase() === color ? '3px solid var(--color-primary, #1D4ED8)' : '2px solid var(--color-border)', flex: '0 0 32px' }} />
        ))}
        <input type="color" disabled={disabled} aria-label={`${t('admin.checklists.appearance.customColor')}: ${label}`} title={t('admin.checklists.appearance.customColor')} value={value ?? fallback} style={{ width: 44, height: 36, padding: 0, border: 0, background: 'none' }}
          onChange={(event) => onPick(event.target.value.toUpperCase())} />
        <button type="button" className="admin-btn admin-btn--sm" disabled={disabled || !value} onClick={() => onPick(undefined)}>{t('admin.checklists.appearance.unset')}</button>
      </div>
    </div>
  );
}

function StepField({ label, value, options, disabled, onPick, t }: { label: string; value: number | undefined; options: readonly number[]; disabled: boolean; onPick: (value: number | undefined) => void; t: TFunction }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'grid', gap: 6 }}>
      <span>{label}</span>
      <div style={row}>
        {options.map((option) => (
          <button key={option} type="button" className="admin-btn admin-btn--sm" disabled={disabled} aria-pressed={value === option} aria-label={`${label}: ${option} px`} style={{ ...step, ...(value === option ? { outline: '2px solid var(--color-primary, #1D4ED8)' } : {}) }} onClick={() => onPick(option)}>{option}</button>
        ))}
        <button type="button" className="admin-btn admin-btn--sm" disabled={disabled || value === undefined} onClick={() => onPick(undefined)}>{t('admin.checklists.appearance.unset')}</button>
      </div>
    </div>
  );
}

/**
 * PR 431: the "Settings" window of one block. It stays closed until a block's button is pressed, does not darken the sheet
 * (the sheet changes while the author edits) and comes up from the bottom on a phone. Values are written to `appearance` at
 * once, so the block in the editor follows every change.
 */
export function BlockSettingsWindow({ target, appearance, onChange, onClose, disabled, t }: {
  target: BlockTarget; appearance: Appearance | null; onChange: (value: Appearance | null) => void; onClose: () => void; disabled: boolean; t: TFunction;
}) {
  const narrow = useNarrowScreen();
  const [scope, setScope] = useState<Scope>('kind');
  const closeButton = useRef<HTMLButtonElement>(null);
  const canOwn = target.id !== null;
  const own = scope === 'own' && canOwn;
  const overrides = appearance?.overrides ?? {};
  const style: BlockStyle = own ? (overrides[target.id!] ?? {}) : (appearance?.blocks?.[target.kind] ?? {});
  const effective = own ? resolveBlockStyle(appearance, target.kind, target.id) : style;
  const kindLabel = t(`admin.checklists.appearance.kind.${target.kind}`);

  useEffect(() => { closeButton.current?.focus(); }, []);
  useEffect(() => { setScope('kind'); }, [target.kind, target.id]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); onClose(); } };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);

  function write(patch: Partial<Record<keyof BlockStyle, BlockStyle[keyof BlockStyle] | undefined>>) {
    const next = { ...style, ...patch } as Record<string, unknown>;
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    onChange(own
      ? sanitizeAppearance({ blocks: appearance?.blocks, overrides: { ...overrides, [target.id!]: next } })
      : sanitizeAppearance({ blocks: { ...appearance?.blocks, [target.kind]: next }, overrides }));
  }
  const panel: CSSProperties = narrow
    ? { left: 0, right: 0, bottom: 0, height: '50vh', borderTop: '1px solid var(--color-border)', borderRadius: '12px 12px 0 0', boxShadow: '0 -4px 16px rgb(0 0 0 / .15)' }
    : { top: 0, right: 0, bottom: 0, width: PANEL_WIDTH, maxWidth: '100vw', borderLeft: '1px solid var(--color-border)', boxShadow: '-4px 0 16px rgb(0 0 0 / .12)' };
  return (
    <div role="dialog" aria-modal="false" aria-label={t('admin.checklists.appearance.settings')} data-testid="checklist-block-settings"
      style={{ position: 'fixed', zIndex: 30, overflowY: 'auto', boxSizing: 'border-box', padding: 16, display: 'grid', gap: 14, alignContent: 'start', background: 'var(--color-surface, #fff)', color: 'var(--color-text, #172033)', ...panel }}>
      <div style={{ ...row, justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{t('admin.checklists.appearance.settings')}</h3>
          <p className="admin-form__hint" style={{ margin: '2px 0 0', overflowWrap: 'anywhere' }}>{kindLabel}{target.name && target.name !== kindLabel ? `: ${target.name}` : ''}</p>
        </div>
        <button ref={closeButton} type="button" className="admin-btn admin-btn--sm" style={{ minWidth: 44, minHeight: 44 }} aria-label={t('admin.checklists.appearance.close')} onClick={onClose}>✕</button>
      </div>
      {canOwn && (
        <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 6 }} disabled={disabled}>
          <legend style={{ padding: 0, marginBottom: 6 }}>{t('admin.checklists.appearance.apply')}</legend>
          {(['kind', 'own'] as const).map((value) => (
            <label key={value} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 32 }}>
              <input type="radio" name="block-settings-scope" checked={scope === value} onChange={() => setScope(value)} style={{ width: 'auto' }} />
              {value === 'kind' ? t('admin.checklists.appearance.scopeKind') : t('admin.checklists.appearance.scopeOwn')}
            </label>
          ))}
        </fieldset>
      )}
      <div style={row}>
        <span>{t('admin.checklists.appearance.presets')}</span>
        {(['strict', 'calm', 'contrast'] as const).map((preset) => (
          <button key={preset} type="button" className="admin-btn admin-btn--sm" disabled={disabled} onClick={() => onChange(sanitizeAppearance({ blocks: APPEARANCE_PRESETS[preset].blocks, overrides }))}>{t(`admin.checklists.appearance.preset.${preset}`)}</button>
        ))}
        <button type="button" className="admin-btn admin-btn--sm" disabled={disabled || !appearance} onClick={() => onChange(null)}>{t('admin.checklists.appearance.reset')}</button>
        {own && <button type="button" className="admin-btn admin-btn--sm" disabled={disabled || !overrides[target.id!]} onClick={() => onChange(sanitizeAppearance({ blocks: appearance?.blocks, overrides: Object.fromEntries(Object.entries(overrides).filter(([id]) => id !== target.id)) }))}>{t('admin.checklists.appearance.resetBlock')}</button>}
      </div>
      <Section title={t('admin.checklists.appearance.sectionBlock')}>
        <ColorField label={t('admin.checklists.appearance.background')} value={style.background} fallback={DEFAULT_BACKGROUND} disabled={disabled} onPick={(value) => write({ background: value })} t={t} />
        <StepField label={t('admin.checklists.appearance.padding')} value={style.padding} options={APPEARANCE_PADDINGS} disabled={disabled} onPick={(value) => write({ padding: value })} t={t} />
      </Section>
      <Section title={t('admin.checklists.appearance.sectionBorder')}>
        <ColorField label={t('admin.checklists.appearance.borderColor')} value={style.borderColor} fallback={DEFAULT_BORDER} disabled={disabled} onPick={(value) => write({ borderColor: value })} t={t} />
        <StepField label={t('admin.checklists.appearance.borderWidth')} value={style.borderWidth} options={Array.from({ length: APPEARANCE_BORDER_MAX + 1 }, (_, index) => index)} disabled={disabled} onPick={(value) => write({ borderWidth: value })} t={t} />
        <StepField label={t('admin.checklists.appearance.radius')} value={style.radius} options={APPEARANCE_RADII} disabled={disabled} onPick={(value) => write({ radius: value })} t={t} />
      </Section>
      <Section title={t('admin.checklists.appearance.sectionText')}>
        <ColorField label={t('admin.checklists.appearance.textColor')} value={style.color} fallback={DEFAULT_COLOR} disabled={disabled} onPick={(value) => write({ color: value })} t={t} />
      </Section>
      {appearanceLowContrast(effective) && <p role="status" style={{ margin: 0, color: 'var(--color-danger, #B91C1C)' }}>{t('admin.checklists.appearance.lowContrast')}</p>}
    </div>
  );
}
