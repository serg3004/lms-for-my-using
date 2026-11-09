import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';

/** PR 458: the widths of the preview frame (the same 390 / 768 as the layout tests); a computer takes the window. */
export type PreviewDevice = 'desktop' | 'tablet' | 'phone';
export const PREVIEW_DEVICE_WIDTH: Record<PreviewDevice, number | null> = { desktop: null, tablet: 768, phone: 390 };
const DEVICES: PreviewDevice[] = ['desktop', 'tablet', 'phone'];
const STORAGE_KEY = 'lms.checklistPreviewDevice';
/** The gap the overlay keeps on both sides of the frame. */
const SIDE_GAP = 32;

function stored(): PreviewDevice {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return DEVICES.includes(value as PreviewDevice) ? (value as PreviewDevice) : 'desktop';
  } catch { return 'desktop'; }
}

/** The chosen device (kept for the browser session) and which devices fit into the window; a frame never exceeds the window. */
export function usePreviewDevice() {
  const [chosen, setChosen] = useState<PreviewDevice>(stored);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const update = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const fits = (device: PreviewDevice) => { const width = PREVIEW_DEVICE_WIDTH[device]; return width === null || width + SIDE_GAP <= windowWidth; };
  const device = fits(chosen) ? chosen : 'desktop';
  const choose = (next: PreviewDevice) => {
    setChosen(next);
    try { window.sessionStorage.setItem(STORAGE_KEY, next); } catch { /* the choice is only a convenience */ }
  };
  return { device, choose, fits, canSwitch: fits('phone') };
}

export function PreviewDeviceSwitch({ device, fits, onChoose, t }: { device: PreviewDevice; fits: (device: PreviewDevice) => boolean; onChoose: (device: PreviewDevice) => void; t: TFunction }) {
  const labels: Record<PreviewDevice, string> = {
    desktop: t('admin.checklists.previewDeviceDesktop', 'Computer'),
    tablet: t('admin.checklists.previewDeviceTablet', 'Tablet'),
    phone: t('admin.checklists.previewDevicePhone', 'Phone'),
  };
  const width = PREVIEW_DEVICE_WIDTH[device];
  return (
    <div className="admin-preview-bar" role="group" aria-label={t('admin.checklists.previewDevice', 'Preview device')}>
      {DEVICES.map((item) => (
        <button key={item} type="button" className={`ds-button ds-button--sm ds-button--${item === device ? 'primary' : 'secondary'}`} style={{ minWidth: 44, minHeight: 44 }}
          aria-pressed={item === device} disabled={!fits(item)} data-device-option={item} onClick={() => onChoose(item)}>{labels[item]}</button>
      ))}
      <span className="admin-form__hint" data-testid="preview-device-width">{width === null ? '' : `${width} px`}</span>
      <span className="admin-form__hint">{t('admin.checklists.previewDeviceLimit', 'The sheet layout is shown in a frame of that width; the browser bar, the on-screen keyboard and the phone’s system pickers are not simulated.')}</span>
    </div>
  );
}
