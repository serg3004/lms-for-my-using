/** PR 369б: highlight colours are stored as a strict `#RRGGBB` string, never as free CSS. */
export const HIGHLIGHT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_LEVEL_COLORS = { full: '#2E7D32', partial: '#E65100', zero: '#C62828' } as const;
export const DEFAULT_RESULT_COLORS = { low: '#C62828', mid: '#F9A825', high: '#2E7D32' } as const;

export type ResultColors = { low: string; mid: string; high: string };

export const normalizeHighlightColor = (color: string) => color.toUpperCase();

/**
 * Colour of a scale level that has no owner-chosen colour: by its share of the scale's best score --
 * the best level is green, a zero score red, anything between orange (the reference's rule).
 */
export function defaultLevelColor(score: number, maxScore: number): string {
  if (score <= 0) return DEFAULT_LEVEL_COLORS.zero;
  if (score >= maxScore) return DEFAULT_LEVEL_COLORS.full;
  return DEFAULT_LEVEL_COLORS.partial;
}

/** Levels with their colour resolved (stored colour wins), used by the scale API and the instance snapshot. */
export function withResolvedLevelColors<T extends { score: number; color?: string | null }>(levels: T[]): Array<Omit<T, 'color'> & { color: string }> {
  const maxScore = Math.max(0, ...levels.map((level) => level.score));
  return levels.map((level) => ({ ...level, color: level.color ?? defaultLevelColor(level.score, maxScore) }));
}

export function resolveResultColors(row: { resultColorLow?: string | null; resultColorMid?: string | null; resultColorHigh?: string | null } | null): ResultColors {
  return {
    low: row?.resultColorLow ?? DEFAULT_RESULT_COLORS.low,
    mid: row?.resultColorMid ?? DEFAULT_RESULT_COLORS.mid,
    high: row?.resultColorHigh ?? DEFAULT_RESULT_COLORS.high,
  };
}

export type HighlightTheme = { fill: string; text: string };
/**
 * What a report row needs to be painted from one chosen colour: the colour itself (left stripe,
 * arc, PDF fill) and, per theme, a soft background with a text colour that keeps WCAG AA contrast.
 */
export type HighlightStyle = { color: string; light: HighlightTheme; dark: HighlightTheme };

const parseHex = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (channels: number[]) => `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const mix = (hex: string, base: number, share: number) => toHex(parseHex(hex).map((c) => c * (1 - share) + base * share));

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_TEXT = '#111111';
const LIGHT_TEXT = '#FFFFFF';
const readableText = (fill: string) => (contrastRatio(fill, DARK_TEXT) >= contrastRatio(fill, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT);

/** Light theme: the colour washed out towards white; dark theme: pulled towards black. Text is chosen by contrast. */
export function highlightStyle(color: string): HighlightStyle {
  const lightFill = mix(color, 255, 0.85);
  const darkFill = mix(color, 0, 0.7);
  return {
    color,
    light: { fill: lightFill, text: readableText(lightFill) },
    dark: { fill: darkFill, text: readableText(darkFill) },
  };
}
