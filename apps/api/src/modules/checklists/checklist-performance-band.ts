export type ManagerPerformanceThresholds = { high: number; low: number | null };
export type ManagerPerformanceBand = 'low' | 'mid' | 'high';

/**
 * PR 350 / DEC-CHKS-001: one rule for the dashboard cards, the employee filter and the export.
 * `high` is inclusive (percentage >= high), `low` is exclusive (percentage < low). Without a
 * configured `low` there is no percentage cut-off, so only the caller's own fallback can say "low".
 */
export function performanceBand(percentage: number, thresholds: ManagerPerformanceThresholds): ManagerPerformanceBand {
  if (percentage >= thresholds.high) return 'high';
  if (thresholds.low !== null && percentage < thresholds.low) return 'low';
  return 'mid';
}
