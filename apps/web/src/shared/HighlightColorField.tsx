import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** PR 369б: highlight colours are free to choose but are only ever stored as `#RRGGBB`. */
export const HIGHLIGHT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Quick choices: the reference's green / orange / red, plus yellow, blue and grey. */
export const QUICK_HIGHLIGHT_COLORS = ['#2E7D32', '#E65100', '#C62828', '#F9A825', '#1565C0', '#616161'] as const;

type HighlightColorFieldProps = {
  /** Accessible name of the whole field, e.g. "Level 1 colour". */
  label: string;
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
};

/**
 * Palette of quick colours, the browser colour picker and a `#RRGGBB` text box. The text box keeps
 * what is being typed and only reports a value once it is a complete, valid colour.
 */
export function HighlightColorField({ label, value, onChange, disabled }: HighlightColorFieldProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => setText(value), [value]);
  const invalid = !HIGHLIGHT_COLOR_PATTERN.test(text);

  const swatch = { width: 44, height: 44, borderRadius: 6, padding: 0, border: '1px solid currentColor' } as const;

  return (
    <div aria-label={label} role="group" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <button
        aria-expanded={paletteOpen}
        aria-label={t('admin.checklists.color.palette', '{{label}}: palette ({{color}})', { label, color: value })}
        disabled={disabled}
        onClick={() => setPaletteOpen((open) => !open)}
        style={{ ...swatch, background: HIGHLIGHT_COLOR_PATTERN.test(value) ? value : 'transparent', cursor: disabled ? 'default' : 'pointer' }}
        type="button"
      />
      <input
        aria-label={t('admin.checklists.color.picker', '{{label}}: color picker', { label })}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        style={{ width: 44, height: 44, padding: 0 }}
        type="color"
        value={HIGHLIGHT_COLOR_PATTERN.test(value) ? value.toLowerCase() : '#000000'}
      />
      <input
        aria-invalid={invalid || undefined}
        aria-label={t('admin.checklists.color.hex', '{{label}}: code #RRGGBB', { label })}
        className="ds-input"
        disabled={disabled}
        maxLength={7}
        onChange={(e) => {
          setText(e.target.value);
          if (HIGHLIGHT_COLOR_PATTERN.test(e.target.value)) onChange(e.target.value.toUpperCase());
        }}
        size={8}
        value={text}
      />
      {paletteOpen && !disabled && (
        <div style={{ display: 'flex', flexBasis: '100%', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_HIGHLIGHT_COLORS.map((color) => (
            <button
              aria-label={`${label}: ${color}`}
              aria-pressed={value.toUpperCase() === color}
              key={color}
              onClick={() => { onChange(color); setPaletteOpen(false); }}
              style={{ ...swatch, background: color, cursor: 'pointer', borderWidth: value.toUpperCase() === color ? 3 : 1 }}
              type="button"
            />
          ))}
        </div>
      )}
    </div>
  );
}
