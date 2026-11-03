import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';

/**
 * PR 411: a context menu opened by the right mouse button, the menu key, Shift+F10 or a long press on a touch screen.
 * It reuses the look of the shared `Menu` panel (`.ds-menu__content`), but is placed at a point with `position: fixed`
 * and kept inside the screen: it opens upwards or to the left when there is no room below or to the right.
 */
export type ContextMenuState<T> = { x: number; y: number; target: T; origin: HTMLElement | null };

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;
const EDGE = 8;
/** Fields keep the browser's own menu (copy, paste, spell check). */
const TEXT_FIELD = 'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]';

export function useContextMenu<T>() {
  const [state, setState] = useState<ContextMenuState<T> | null>(null);
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const close = useCallback(() => setState(null), []);
  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  /** The handlers that make an element (a row, a label, the empty area) open the menu for `target`. */
  function triggerProps(target: T, onBeforeOpen?: () => void) {
    function openAt(point: { x: number; y: number }, origin: HTMLElement) {
      onBeforeOpen?.();
      setState({ x: point.x, y: point.y, target, origin });
    }
    function keyboardPoint(element: HTMLElement) {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + Math.min(32, rect.width / 2), y: rect.bottom };
    }
    return {
      onContextMenu(event: MouseEvent<HTMLElement>) {
        if ((event.target as HTMLElement).closest(TEXT_FIELD)) return;
        event.preventDefault();
        event.stopPropagation();
        clearTimer();
        const fromKeyboard = event.clientX === 0 && event.clientY === 0;
        openAt(fromKeyboard ? keyboardPoint(event.currentTarget) : { x: event.clientX, y: event.clientY }, event.currentTarget);
      },
      onKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
        if ((event.target as HTMLElement).closest(TEXT_FIELD)) return;
        event.preventDefault();
        event.stopPropagation();
        openAt(keyboardPoint(event.currentTarget), event.currentTarget);
      },
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.pointerType !== 'touch' || (event.target as HTMLElement).closest(TEXT_FIELD)) return;
        clearTimer();
        const origin = event.currentTarget;
        const point = { x: event.clientX, y: event.clientY };
        start.current = point;
        timer.current = window.setTimeout(() => {
          timer.current = null;
          suppressClick.current = true;
          openAt(point, origin);
        }, LONG_PRESS_MS);
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const from = start.current;
        if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > LONG_PRESS_SLOP) clearTimer();
      },
      onPointerUp: clearTimer,
      onPointerCancel: clearTimer,
      // The click that ends a long press must not open or toggle whatever lies under the finger.
      onClickCapture(event: MouseEvent<HTMLElement>) {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    };
  }

  return { state, close, triggerProps };
}

export function ContextMenu<T>({ state, label, onClose, children }: {
  state: ContextMenuState<T> | null;
  /** Accessible name of the menu: what it acts on. */
  label: string;
  onClose: () => void;
  /** The `menuitem` buttons. Choosing one closes the menu and returns the focus to the element it was opened on. */
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<CSSProperties | undefined>(undefined);
  const origin = state?.origin ?? null;

  useLayoutEffect(() => {
    if (!state) { setPlacement(undefined); return; }
    const width = ref.current?.offsetWidth ?? 0;
    const height = ref.current?.offsetHeight ?? 0;
    const viewportWidth = document.documentElement.clientWidth;
    const left = state.x + width + EDGE > viewportWidth ? Math.max(EDGE, state.x - width) : state.x;
    const top = state.y + height + EDGE > window.innerHeight ? Math.max(EDGE, state.y - height) : state.y;
    setPlacement({ position: 'fixed', left, top, right: 'auto', bottom: 'auto' });
  }, [state]);

  useEffect(() => {
    if (!state || !placement) return undefined;
    const root = ref.current;
    const items = () => Array.from(root?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"]):not(:disabled)') ?? []);
    items()[0]?.focus();
    function close(returnFocus: boolean) {
      onClose();
      if (returnFocus) requestAnimationFrame(() => origin?.focus());
    }
    function pointerDown(event: globalThis.PointerEvent) { if (root && !root.contains(event.target as Node)) close(false); }
    function keyDown(event: globalThis.KeyboardEvent) {
      const menuItems = items();
      const index = menuItems.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        menuItems[(index + offset + menuItems.length) % menuItems.length]?.focus();
      } else if (event.key === 'Home') { event.preventDefault(); menuItems[0]?.focus(); }
      else if (event.key === 'End') { event.preventDefault(); menuItems.at(-1)?.focus(); }
      else if (event.key === 'Tab') { event.preventDefault(); close(true); }
    }
    const dismiss = () => close(false);
    document.addEventListener('pointerdown', pointerDown);
    document.addEventListener('keydown', keyDown, true);
    window.addEventListener('resize', dismiss);
    // The user's own scrolling dismisses the menu; a scroll caused by moving the focus (a closing dialog) does not.
    window.addEventListener('wheel', dismiss, { passive: true });
    window.addEventListener('touchmove', dismiss, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', pointerDown);
      document.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('wheel', dismiss);
      window.removeEventListener('touchmove', dismiss);
    };
  }, [state, placement, onClose, origin]);

  if (!state) return null;
  return (
    <div aria-label={label} className="ds-menu__content" onClick={() => { origin?.focus(); onClose(); }} onContextMenu={(event) => event.preventDefault()} ref={ref} role="menu" style={placement ?? { position: 'fixed', left: state.x, top: state.y, visibility: 'hidden' }}>
      {children}
    </div>
  );
}
