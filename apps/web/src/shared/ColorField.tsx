import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** PR 369б: colours are free to choose but are only ever stored as `#RRGGBB`. */
export const HIGHLIGHT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Quick choices: the reference's green / orange / red, plus yellow, blue and grey. */
export const QUICK_HIGHLIGHT_COLORS = ['#2E7D32', '#E65100', '#C62828', '#F9A825', '#1565C0', '#616161'] as const;

type ColorFieldProps = {
  /** Accessible name of the whole field, e.g. "Level 1 colour". */
  label: string;
  /** `undefined` means "no colour chosen" (only shown when `onUnset` is given). */
  value: string | undefined;
  onChange: (color: string) => void;
  /** Adds a "Reset" button; the colour then comes from somewhere else (organisation, default). */
  onUnset?: () => void;
  /** Colour the "Own colour" picker opens on while nothing is chosen. */
  fallback?: string;
  swatches?: readonly string[];
  disabled?: boolean;
  /** Shows the label above the field (a field that is not already named by a heading). */
  showLabel?: boolean;
  /** No `#RRGGBB` box (small floating windows). */
  compact?: boolean;
};

/**
 * PR 579: the one colour field of the application. A row of quick colours (the chosen one is ringed), "Own colour" (the
 * system colour picker) and the `#RRGGBB` box. The box keeps what is being typed and only reports a complete, valid
 * colour. Nothing opens or moves: the field is always the same height.
 */
export function ColorField({ label, value, onChange, onUnset, fallback = '#2E7D32', swatches = QUICK_HIGHLIGHT_COLORS, disabled, showLabel, compact }: ColorFieldProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const valid = value !== undefined && HIGHLIGHT_COLOR_PATTERN.test(value);
  const invalid = text !== '' && !HIGHLIGHT_COLOR_PATTERN.test(text);
  const same = (color: string) => value?.toUpperCase() === color.toUpperCase();

  return (
    <div aria-label={label} className="color-field" role="group">
      {showLabel && <span className="color-field__label">{label}</span>}
      <div className="color-field__row">
        {swatches.map((color) => (
          <button
            aria-label={`${label}: ${color}`}
            aria-pressed={same(color)}
            className="color-field__swatch"
            disabled={disabled}
            key={color}
            onClick={() => onChange(color.toUpperCase())}
            style={{ background: color }}
            type="button"
          />
        ))}
        <label className="color-field__custom" title={t('admin.checklists.color.custom', 'Own colour')}>
          <input
            aria-label={t('admin.checklists.color.picker', '{{label}}: color picker', { label })}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            type="color"
            value={valid ? value.toLowerCase() : fallback.toLowerCase()}
          />
          <span aria-hidden="true">{t('admin.checklists.color.custom', 'Own colour')}</span>
        </label>
        {!compact && (
          <input
            aria-invalid={invalid || undefined}
            aria-label={t('admin.checklists.color.hex', '{{label}}: code #RRGGBB', { label })}
            className="ds-input color-field__hex"
            disabled={disabled}
            maxLength={7}
            onChange={(e) => {
              setText(e.target.value);
              if (HIGHLIGHT_COLOR_PATTERN.test(e.target.value)) onChange(e.target.value.toUpperCase());
            }}
            placeholder="#RRGGBB"
            value={text}
          />
        )}
        {onUnset && (
          <button className="admin-btn admin-btn--sm admin-btn--secondary" disabled={disabled || value === undefined} onClick={onUnset} type="button">
            {t('admin.checklists.appearance.unset', 'Reset')}
          </button>
        )}
      </div>
    </div>
  );
}
