import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { listAnalyticsEmployees, saveAnalyticsFilterSet, type AnalyticsEmployee, type AnalyticsFilterKey, type AnalyticsFilterSet } from '../shared/api/manager.js';

/** PR 518: every filter of the analytics tab; the user (or the organization) picks which are shown and in what order. */
export const ALL_FILTER_KEYS: readonly AnalyticsFilterKey[] = ['period', 'sheets', 'department', 'employee', 'manager', 'userFields'];
/** What a person sees when nobody configured anything: the field filters of PR 502 stay hidden until switched on. */
export const DEFAULT_FILTER_KEYS: readonly AnalyticsFilterKey[] = ['period', 'sheets', 'department', 'employee', 'manager'];

/** Exported for tests: the viewer's set wins over the organization default, which wins over the built-in order. */
export function resolveFilterKeys(set: AnalyticsFilterSet | null): AnalyticsFilterKey[] {
  return [...(set?.user ?? set?.organization ?? DEFAULT_FILTER_KEYS)];
}

/** Exported for tests: the full ordered list for the editor -- enabled filters first in their order, then the hidden ones. */
export function orderedWithHidden(enabled: readonly AnalyticsFilterKey[]): Array<{ key: AnalyticsFilterKey; on: boolean }> {
  return [...enabled.map((key) => ({ key, on: true })), ...ALL_FILTER_KEYS.filter((key) => !enabled.includes(key)).map((key) => ({ key, on: false }))];
}

/** Exported for tests: moves one entry by a step. */
export function moveFilter<T>(list: readonly T[], index: number, step: -1 | 1): T[] {
  const target = index + step;
  if (target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * PR 519: one filter of the bar as in the approved mock-up: a small caption, a field with the current value and a panel that opens under it.
 * Closes on Escape and on a click outside; the panel is a labelled group so keyboard and screen reader users reach it like any control.
 */
export function FilterDropdown({ label, value, children, wide, bare }: { label: string; value: string; children: ReactNode; wide?: boolean; bare?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={root} style={{ display: 'grid', gap: 6, minWidth: 0, position: 'relative', alignContent: bare ? 'end' : undefined }}>
      {!bare && <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-muted)' }}>{label}</span>}
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={bare ? label : `${label}: ${value}`}
        className={bare ? 'ds-button ds-button--secondary' : 'ds-input'}
        onClick={() => setOpen((current) => !current)}
        style={{ alignItems: 'center', cursor: 'pointer', display: 'flex', gap: 8, justifyContent: 'space-between', minHeight: 44, textAlign: 'left' }}
        type="button"
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bare ? label : value}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          aria-label={label}
          id={panelId}
          role="group"
          style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.22)', display: 'grid', gap: 8,
            left: 0, maxHeight: 420, maxWidth: 'min(92vw, 460px)', minWidth: wide ? 320 : 240, overflowY: 'auto', padding: 12, position: 'absolute', top: '100%', width: 'max-content', zIndex: 30,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function ids(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

export function toggleId(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
}

/** Several departments at once; an empty selection means every department. */
export function DepartmentFilter({ options, selected, onChange }: { options: Array<{ id: string; name: string }>; selected: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const label = t('manager.checklists.departmentFilter', 'Department');
  const value = selected.length === 0 ? t('manager.checklists.allDepartments', 'All departments') : selected.length === 1 ? (options.find((option) => option.id === selected[0])?.name ?? '1') : String(selected.length);
  return (
    <FilterDropdown label={label} value={value}>
      {options.map((option) => (
        <label key={option.id} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
          <input checked={selected.includes(option.id)} onChange={() => onChange(toggleId(selected, option.id))} style={{ width: 20, height: 20, flex: 'none' }} type="checkbox" />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{option.name}</span>
        </label>
      ))}
    </FilterDropdown>
  );
}

/** Employees found by name (within the viewer's scope), picked one or several; the chosen names stay visible as chips. */
export function EmployeeFilter({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<AnalyticsEmployee[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void listAnalyticsEmployees(query.trim()).then((response) => {
        if (!active) return;
        const list = Array.isArray(response) ? response : [];
        setFound(list);
        setNames((current) => ({ ...current, ...Object.fromEntries(list.map((employee) => [employee.id, employee.name])) }));
      }, () => { if (active) setFound([]); });
    }, query ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  const value = selected.length === 0 ? t('sheetAnalytics.allEmployees', 'All employees') : selected.length === 1 ? (names[selected[0]!] ?? '1') : String(selected.length);
  return (
    <FilterDropdown label={t('sheetAnalytics.employeeFilter', 'Employee')} value={value} wide>
      <input aria-label={t('sheetAnalytics.employeeSearch', 'Search employees')} className="ds-input" onChange={(event) => setQuery(event.target.value)} placeholder={t('sheetAnalytics.employeeSearch', 'Search employees')} type="search" value={query} />
      {selected.length > 0 && (
        <ul aria-label={t('sheetAnalytics.selectedEmployees', 'Selected employees')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
          {selected.map((id) => (
            <li className="ui-status-badge" key={id} style={{ alignItems: 'center', display: 'inline-flex', gap: 4 }}>
              {names[id] ?? t('sheetAnalytics.employeeUnknown', 'Employee')}
              <button aria-label={`${t('sheetAnalytics.removeSheet', 'Remove')}: ${names[id] ?? id}`} className="ds-button ds-button--text ds-button--icon" onClick={() => onChange(toggleId(selected, id))} type="button">×</button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'grid', gap: 2 }}>
        {found.map((employee) => (
          <label key={employee.id} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
            <input checked={selected.includes(employee.id)} onChange={() => onChange(toggleId(selected, employee.id))} style={{ width: 20, height: 20, flex: 'none' }} type="checkbox" />
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{employee.name}</span>
          </label>
        ))}
        {found.length === 0 && <span style={{ color: 'var(--color-text-muted)' }}>{t('sheetAnalytics.noEmployees', 'No employees found.')}</span>}
      </div>
    </FilterDropdown>
  );
}

const LABEL_KEYS: Record<AnalyticsFilterKey, [string, string]> = {
  period: ['manager.checklists.periodFilter', 'Period'],
  sheets: ['sheetAnalytics.sheetsFilter', 'Checklists'],
  department: ['manager.checklists.departmentFilter', 'Department'],
  employee: ['sheetAnalytics.employeeFilter', 'Employee'],
  manager: ['manager.checklists.managerFilter', 'Manager'],
  userFields: ['sheetAnalytics.moreFilters', 'More filters'],
};

/** The "Filters" button: switch filters on and off, change their order, save it for yourself or (administrator) for everyone. */
export function FilterSetEditor({ enabled, isAdmin, onSaved }: { enabled: AnalyticsFilterKey[]; isAdmin: boolean; onSaved: (set: AnalyticsFilterSet) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => orderedWithHidden(enabled));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const draftKeys = useMemo(() => draft.filter((entry) => entry.on).map((entry) => entry.key), [draft]);
  useEffect(() => setDraft(orderedWithHidden(enabled)), [enabled]);

  async function save(keys: AnalyticsFilterKey[], scope: 'user' | 'organization') {
    setBusy(true);
    setFailed(false);
    try {
      onSaved(await saveAnalyticsFilterSet(keys, scope));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FilterDropdown bare label={t('sheetAnalytics.filterSetTitle', 'Choose filters')} value="" wide>
      <div style={{ display: 'grid', gap: 8 }}>
        <ol style={{ display: 'grid', gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>
          {draft.map((entry, index) => {
            const [labelKey, fallback] = LABEL_KEYS[entry.key];
            const label = t(labelKey, fallback);
            return (
              <li key={entry.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minHeight: 44 }}>
                  <input checked={entry.on} onChange={() => setDraft(draft.map((item) => item.key === entry.key ? { ...item, on: !item.on } : item))} style={{ width: 20, height: 20, flex: 'none' }} type="checkbox" />
                  {label}
                </label>
                <button aria-label={`${t('sheetAnalytics.moveUp', 'Move up')}: ${label}`} className="ds-button ds-button--secondary ds-button--icon" disabled={index === 0} onClick={() => setDraft(moveFilter(draft, index, -1))} type="button">↑</button>
                <button aria-label={`${t('sheetAnalytics.moveDown', 'Move down')}: ${label}`} className="ds-button ds-button--secondary ds-button--icon" disabled={index === draft.length - 1} onClick={() => setDraft(moveFilter(draft, index, 1))} type="button">↓</button>
              </li>
            );
          })}
        </ol>
        {failed && <p role="alert" style={{ margin: 0 }}>{t('sheetAnalytics.filterSetError', 'The filter set could not be saved.')}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button className="ds-button ds-button--primary" disabled={busy || draftKeys.length === 0} onClick={() => void save(draftKeys, 'user')} type="button">{t('sheetAnalytics.filterSetSave', 'Save for me')}</button>
          {isAdmin && <button className="ds-button ds-button--secondary" disabled={busy || draftKeys.length === 0} onClick={() => void save(draftKeys, 'organization')} type="button">{t('sheetAnalytics.filterSetSaveOrg', 'Make default for everyone')}</button>}
          <button className="ds-button ds-button--secondary" disabled={busy} onClick={() => void save([], 'user')} type="button">{t('sheetAnalytics.filterSetReset', 'Reset my set')}</button>
        </div>
      </div>
    </FilterDropdown>
  );
}
