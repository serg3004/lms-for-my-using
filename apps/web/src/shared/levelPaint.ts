/**
 * PR 425: how a chosen answer is painted. The colour is the scale level's own (PR 369б); a level
 * without one (the built-in Yes/No, a legacy sheet scale) gets the same default the server uses:
 * best score green, zero red, anything between orange. Inline styles only (the CSS budget is spent).
 */
export const DEFAULT_LEVEL_COLORS = { full: '#2E7D32', partial: '#E65100', zero: '#C62828' } as const;

/** "No points" sheets (PR 416) carry no good/bad judgement, so the chosen answer is painted neutral. */
export const NEUTRAL_LEVEL_COLOR = '#475569';

export function defaultLevelColor(points: number, maxPoints: number): string {
  if (points <= 0) return DEFAULT_LEVEL_COLORS.zero;
  if (points >= maxPoints) return DEFAULT_LEVEL_COLORS.full;
  return DEFAULT_LEVEL_COLORS.partial;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (values: number[]) => `#${values.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function levelContrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export type LevelPaint = { background: string; borderColor: string; color: string };

/** The whole option area washed with the level colour (85% towards white), a solid border in it, text chosen by contrast (AA). */
export function levelPaint(color: string): LevelPaint {
  const base = HEX.test(color) ? color.toUpperCase() : DEFAULT_LEVEL_COLORS.partial;
  const background = toHex(channels(base).map((c) => c * 0.15 + 255 * 0.85));
  const text = levelContrast(background, '#111111') >= levelContrast(background, '#FFFFFF') ? '#111111' : '#FFFFFF';
  return { background, borderColor: base, color: text };
}
