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
