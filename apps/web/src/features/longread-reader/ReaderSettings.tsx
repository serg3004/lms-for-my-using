import { useTranslation } from 'react-i18next';
import type { LongreadDraft } from '../../shared/api/longreads.js';
type Settings = LongreadDraft['settings'];
export function ReaderSettings({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const { t } = useTranslation();
  return <details className="admin-card" style={{ marginBlock: 16 }}>
    <summary style={{ minHeight: 44, cursor: 'pointer' }}>{t('longreadReader.settings')}</summary>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 16, marginTop: 12 }}>
      <div><label htmlFor="lr-reading-order">{t('longreadReader.order')}</label><select id="lr-reading-order" value={settings.readingOrder} onChange={(event) => onChange({ readingOrder: event.target.value as Settings['readingOrder'] })}>
        <option value="free">{t('longreadReader.free')}</option><option value="sequential">{t('longreadReader.sequential')}</option>
      </select></div>
      <div><label htmlFor="lr-required-chapters">{t('longreadReader.requiredSetting')}</label><input id="lr-required-chapters" type="number" min={0} max={200} value={settings.requiredChapters} onChange={(event) => onChange({ requiredChapters: Number(event.target.value) })} /></div>
      <div><label htmlFor="lr-toc">{t('longreadReader.contents')}</label><select id="lr-toc" value={settings.tableOfContents} onChange={(event) => onChange({ tableOfContents: event.target.value as Settings['tableOfContents'] })}>
        <option value="expanded">{t('longreadReader.expanded')}</option><option value="collapsed">{t('longreadReader.collapsed')}</option><option value="off">{t('longreadReader.off')}</option>
      </select></div>
      <div><label htmlFor="lr-direction">{t('longreadReader.direction')}</label><select id="lr-direction" value={settings.direction} onChange={(event) => onChange({ direction: event.target.value as Settings['direction'] })}>
        <option value="ltr">{t('longreadReader.ltr')}</option><option value="rtl">{t('longreadReader.rtl')}</option>
      </select></div>
      <label><input style={{ width: 'auto' }} type="checkbox" checked={settings.allowCopy} onChange={(event) => onChange({ allowCopy: event.target.checked })} /> {t('longreadReader.allowCopy')}</label>
    </div>
  </details>;
}
