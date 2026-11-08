import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * PR 453: one list for every `<select>` of the app.
 *
 * The window of a native list is drawn by the browser itself; in Chrome on some Windows machines it comes out with empty rows, and no CSS reaches it.
 * This component takes over the opening of any single-choice `<select>` with a mouse or keyboard and draws the rows as ordinary page elements.
 * The `<select>` itself stays in place (value, label, form, tests, screen readers), the choice is written to it and a `change` event is sent,
 * so no screen has to change. Touch screens keep the system picker, which the phone draws well.
 * A single `<select data-native-popup="true">` opts out.
 */

type Row = { kind: 'group'; key: string; label: string } | { kind: 'option'; key: string; label: string; value: string; disabled: boolean; selected: boolean };
type OpenState = { select: HTMLSelectElement; rows: Row[]; rect: DOMRect; active: number };

const MAX_HEIGHT = 280;
const GAP = 4;

function coarse(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

function eligible(target: EventTarget | null): HTMLSelectElement | null {
  if (!(target instanceof Element)) return null;
  const select = target.closest('select');
  if (!select || select.multiple || select.size > 1 || select.disabled || select.dataset.nativePopup === 'true') return null;
  return select;
}

function readRows(select: HTMLSelectElement): Row[] {
  const rows: Row[] = [];
  let index = 0;
  const addOption = (option: HTMLOptionElement, inGroupDisabled: boolean) => {
    rows.push({ kind: 'option', key: `o${index}`, label: option.textContent ?? option.value, value: option.value, disabled: option.disabled || inGroupDisabled, selected: option.selected });
    index += 1;
  };
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      rows.push({ kind: 'group', key: `g${index}`, label: child.label });
      for (const option of Array.from(child.children)) if (option instanceof HTMLOptionElement) addOption(option, child.disabled);
    } else if (child instanceof HTMLOptionElement) {
      addOption(child, false);
    }
  }
  return rows;
}

function enabledIndexes(rows: Row[]): number[] {
  return rows.flatMap((row, index) => (row.kind === 'option' && !row.disabled ? [index] : []));
}

function firstActive(rows: Row[]): number {
  const selected = rows.findIndex((row) => row.kind === 'option' && row.selected && !row.disabled);
  return selected >= 0 ? selected : (enabledIndexes(rows)[0] ?? -1);
}

export function SelectPopup() {
  const [state, setState] = useState<OpenState | null>(null);
  const stateRef = useRef<OpenState | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);
  const typedRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  stateRef.current = state;

  const close = useCallback((refocus: boolean) => {
    const open = stateRef.current;
    setState(null);
    if (refocus) open?.select.focus();
  }, []);

  const pick = useCallback((open: OpenState, index: number) => {
    const row = open.rows[index];
    if (!row || row.kind !== 'option' || row.disabled) return;
    const { select } = open;
    if (select.value !== row.value) {
      select.value = row.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close(true);
  }, [close]);

  const show = useCallback((select: HTMLSelectElement) => {
    const rows = readRows(select);
    if (rows.length === 0) return;
    setState({ select, rows, rect: select.getBoundingClientRect(), active: firstActive(rows) });
  }, []);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const open = stateRef.current;
      const target = event.target as Node | null;
      if (open && popupRef.current?.contains(target)) return;
      const select = event.button === 0 && !coarse() ? eligible(event.target) : null;
      if (select) {
        event.preventDefault();
        select.focus();
        if (open?.select === select) close(false); else show(select);
        return;
      }
      if (open) close(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const open = stateRef.current;
      if (!open) {
        const select = coarse() ? null : eligible(event.target);
        if (select && (event.key === ' ' || event.key === 'Enter' || (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')))) {
          event.preventDefault();
          show(select);
        }
        return;
      }
      const enabled = enabledIndexes(open.rows);
      const move = (to: number) => setState({ ...open, active: to });
      const at = enabled.indexOf(open.active);
      switch (event.key) {
        case 'Escape': event.preventDefault(); close(true); return;
        case 'Tab': close(false); return;
        case 'ArrowDown': event.preventDefault(); if (enabled.length) move(enabled[Math.min(at + 1, enabled.length - 1)] as number); return;
        case 'ArrowUp': event.preventDefault(); if (enabled.length) move(enabled[Math.max(at - 1, 0)] as number); return;
        case 'Home': event.preventDefault(); if (enabled.length) move(enabled[0] as number); return;
        case 'End': event.preventDefault(); if (enabled.length) move(enabled[enabled.length - 1] as number); return;
        case 'Enter':
        case ' ': event.preventDefault(); pick(open, open.active); return;
        default: {
          if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
          const now = Date.now();
          const text = (now - typedRef.current.at < 700 ? typedRef.current.text : '') + event.key.toLowerCase();
          typedRef.current = { text, at: now };
          const hit = enabled.find((index) => (open.rows[index] as Row).label.trim().toLowerCase().startsWith(text));
          if (hit !== undefined) { event.preventDefault(); move(hit); }
        }
      }
    };

    const onScroll = (event: Event) => {
      const open = stateRef.current;
      if (!open || popupRef.current?.contains(event.target as Node | null)) return;
      // A scroll that did not move the field (late scroll of the focus jump, a scroll elsewhere) keeps the list; one that moved it closes the list.
      const now = open.select.getBoundingClientRect();
      if (Math.abs(now.top - open.rect.top) > 1 || Math.abs(now.left - open.rect.left) > 1) close(false);
    };
    const onResize = () => { if (stateRef.current) close(false); };

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [close, pick, show]);

  useLayoutEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [state?.active, state?.select]);

  if (!state) return null;
  const { select, rows, rect, active } = state;
  const below = window.innerHeight - rect.bottom - GAP - 8;
  const above = rect.top - GAP - 8;
  const wanted = Math.min(MAX_HEIGHT, rows.length * 38 + 8);
  const openUp = below < wanted && above > below;
  const maxHeight = Math.max(120, Math.min(MAX_HEIGHT, openUp ? above : below));
  const container = select.closest('dialog') ?? document.body;
  const label = select.getAttribute('aria-label') ?? select.labels?.[0]?.textContent ?? undefined;

  return createPortal(
    <div
      aria-label={label}
      data-testid="select-popup"
      ref={popupRef}
      role="listbox"
      style={{
        position: 'fixed', zIndex: 2000, left: rect.left, minWidth: rect.width, maxWidth: 'min(96vw, 560px)', maxHeight, overflowY: 'auto', boxSizing: 'border-box', padding: 4,
        ...(openUp ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
        border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface)', color: 'var(--color-text)',
        boxShadow: '0 8px 24px rgb(23 32 51 / 18%)', font: '14px/1.4 system-ui, "Segoe UI", sans-serif',
      }}
    >
      {rows.map((row, index) => row.kind === 'group'
        ? <div key={row.key} style={{ padding: '6px 10px 2px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>{row.label}</div>
        : <div
            aria-disabled={row.disabled || undefined}
            aria-selected={row.selected}
            key={row.key}
            ref={index === active ? activeRef : undefined}
            role="option"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 10px', borderRadius: 6, whiteSpace: 'normal', overflowWrap: 'anywhere',
              cursor: row.disabled ? 'not-allowed' : 'pointer', opacity: row.disabled ? 0.5 : 1, fontWeight: row.selected ? 600 : 400,
              background: index === active ? 'var(--color-primary)' : 'transparent', color: index === active ? '#ffffff' : 'inherit',
            }}
            onMouseEnter={() => { if (!row.disabled && index !== active) setState({ ...state, active: index }); }}
            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onClick={() => pick(state, index)}
          >
            <span>{row.label}</span>
            {row.selected ? <span aria-hidden="true">✓</span> : null}
          </div>)}
    </div>,
    container,
  );
}
