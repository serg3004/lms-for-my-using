import type { SheetAnalyticsScale } from '../shared/api/manager.js';

export const percent = (value: number | null) => (value === null ? '—' : `${value}%`);
const FALLBACK_COLORS = ['#0f9f6e', '#d97706', '#dc2626', '#4f46e5', '#0e7490', '#6b7280'];

/** The answer levels of one scale as bars: names and colours come from the scale itself, whatever its levels are called. */
export function ScaleLevelBars({ scale, t }: { scale: SheetAnalyticsScale; t: (key: string, fallback: string) => string }) {
  const total = scale.levels.reduce((sum, level) => sum + level.count, 0);
  const title = scale.kind === 'yes_no' ? t('sheetAnalytics.scaleYesNo', 'Yes / No criteria') : scale.kind === 'sheet' ? t('sheetAnalytics.scaleSheet', 'Scale of the sheet') : scale.name ?? '';
  return (
    <section aria-label={title} data-testid="sheet-analytics-scale" style={{ display: 'grid', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
      {scale.levels.map((level, index) => {
        const label = level.labelKey === 'yes' ? t('sheetAnalytics.yes', 'Yes') : level.labelKey === 'no' ? t('sheetAnalytics.no', 'No') : level.label ?? String(level.value);
        const share = total > 0 ? Math.round((level.count / total) * 100) : 0;
        const color = level.color ?? (level.labelKey === 'no' ? '#dc2626' : level.labelKey === 'yes' ? '#0f9f6e' : FALLBACK_COLORS[index % FALLBACK_COLORS.length]);
        return (
          <div key={`${level.value}-${level.label}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '2px 12px', alignItems: 'center' }}>
            <span style={{ overflowWrap: 'anywhere' }}>{label}</span>
            <strong>{level.count} · {share}%</strong>
            <div aria-hidden="true" style={{ gridColumn: '1 / -1', height: 8, borderRadius: 4, background: 'var(--color-border, #e3e8ef)', overflow: 'hidden' }}>
              <div style={{ width: `${share}%`, height: '100%', background: color }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

