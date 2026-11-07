import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { TFunction } from 'i18next';

/** PR 435: the two tabs of the sheet editor. «Основное» holds the sheet itself, «Настройки» all the settings of the sheet. */
export type BuilderTab = 'main' | 'settings';
export const BUILDER_TABS: readonly BuilderTab[] = ['main', 'settings'];

export function builderTabFromHash(hash: string): BuilderTab {
  return hash === '#settings' ? 'settings' : 'main';
}

export function ChecklistBuilderTabs({ active, onChange, errorTab, t, children }: {
  active: BuilderTab;
  onChange: (tab: BuilderTab) => void;
  /** The tab whose field the last failed save complained about; it is marked until the next save. */
  errorTab: BuilderTab | null;
  t: TFunction;
  /** The Save button and the status line: they stay visible on both tabs. */
  children?: ReactNode;
}) {
  const refs = useRef<Partial<Record<BuilderTab, HTMLButtonElement | null>>>({});
  const labels: Record<BuilderTab, string> = {
    main: t('admin.checklists.tab.main', 'Main'),
    settings: t('admin.checklists.tab.settings', 'Settings'),
  };
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: BuilderTab) {
    const index = BUILDER_TABS.indexOf(tab);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % BUILDER_TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + BUILDER_TABS.length) % BUILDER_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = BUILDER_TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = BUILDER_TABS[next] as BuilderTab;
    onChange(target);
    refs.current[target]?.focus();
  }
  return (
    <div className="admin-builder-tabbar">
      <div aria-label={t('admin.checklists.tab.label', 'Sections of the checklist')} className="admin-org-tabs" role="tablist">
        {BUILDER_TABS.map((tab) => (
          <button
            aria-controls={`checklist-panel-${tab}`}
            aria-selected={active === tab}
            className="admin-org-tabs__tab"
            id={`checklist-tab-${tab}`}
            key={tab}
            onClick={() => onChange(tab)}
            onKeyDown={(event) => onKeyDown(event, tab)}
            ref={(node) => { refs.current[tab] = node; }}
            role="tab"
            tabIndex={active === tab ? 0 : -1}
            type="button"
          >
            {labels[tab]}
            {errorTab === tab && <span aria-label={t('admin.checklists.tab.hasError', 'has an error')} role="img" style={{ color: 'var(--color-danger, #b42318)', fontWeight: 700 }}>!</span>}
          </button>
        ))}
      </div>
      <div className="admin-builder-tabbar__actions">{children}</div>
    </div>
  );
}
