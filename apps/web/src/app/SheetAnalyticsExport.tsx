import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SheetAnalyticsExportQuery } from '../shared/api/manager.js';
import { exportSheetAnalytics } from '../shared/api/manager.js';
import { downloadCsvFile, downloadXlsxFile } from '../shared/downloadCsv.js';
import { Button } from '../shared/ui.js';

/**
 * PR 463: "Download CSV / Excel" of the current view of the Analytics tab. The server repeats the view (the same
 * filters, picked rows, search and sorting) and the access rule of the screen; an empty view downloads nothing.
 */
export function SheetAnalyticsExport({ query, sheetName, disabled }: { query: Omit<SheetAnalyticsExportQuery, 'format'>; sheetName: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const busy = useRef(false);
  const [notice, setNotice] = useState('');

  async function run(format: 'csv' | 'xlsx') {
    if (busy.current) return;
    busy.current = true;
    setNotice('');
    try {
      const file = await exportSheetAnalytics({ ...query, format });
      if (file.rowCount === 0) setNotice(t('sheetAnalytics.exportEmpty', 'There is nothing to export for this view.'));
      else if (format === 'xlsx') await downloadXlsxFile(file.filename, file.rows, sheetName);
      else downloadCsvFile(file.filename, file.csv);
    } catch {
      setNotice(t('sheetAnalytics.exportError', 'Unable to export this view.'));
    } finally {
      busy.current = false;
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {notice && <span role="status" style={{ color: 'var(--color-text-muted)', marginRight: 'auto' }}>{notice}</span>}
      {(['csv', 'xlsx'] as const).map((format) => (
        <Button disabled={disabled} key={format} onClick={() => void run(format)} size="sm" type="button" variant="secondary">
          {format === 'csv' ? t('sheetAnalytics.exportCsv', 'Download CSV') : t('sheetAnalytics.exportXlsx', 'Download Excel')}
        </Button>
      ))}
    </div>
  );
}
