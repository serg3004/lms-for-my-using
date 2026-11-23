import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const STORAGE_KEY = 'lms.navCollapsed';

function readStored() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

/** Desktop-only "icons only" mode of the sidebar, remembered per browser (storage may be blocked, so every access is guarded). */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readStored);
  function toggle() {
    setCollapsed((value) => {
      try { localStorage.setItem(STORAGE_KEY, value ? '0' : '1'); } catch { /* the choice just is not remembered */ }
      return !value;
    });
  }
  return { collapsed, toggle, navAttribute: collapsed ? 'collapsed' as const : undefined };
}

/** Footer button of the sidebar; hidden by CSS on phones, where the sidebar is a drawer. */
export function SidebarCollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button aria-pressed={collapsed} className="nav-collapse" onClick={onToggle} type="button">
      <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
      <span>{collapsed ? t('a11y.expandNav', 'Expand menu') : t('a11y.collapseNav', 'Collapse menu')}</span>
    </button>
  );
}
