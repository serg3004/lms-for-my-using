import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Only one hint is open on the page: opening a hint closes the one that was open before it. */
let closeActiveTip: (() => void) | null = null;

const LEAVE_DELAY_MS = 150;

/**
 * "?" button with a popup hint (PR 412). The hint opens only from the icon itself: hover over the "?",
 * keyboard focus on the button, or a tap/click. Hovering the whole row or focusing the checkbox does not open it.
 * Closes on Escape, an outside click, leaving the icon and the hint (a short delay lets the pointer reach the text)
 * or when another hint opens.
 */
export function ChecklistHelpTip({ name, children }: { name: string; children: ReactNode }) {
  const { t } = useTranslation();
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const pinned = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimer = () => { if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; } };
  const close = () => { clearLeaveTimer(); pinned.current = false; setOpen(false); };

  useEffect(() => {
    if (!open) return undefined;
    if (closeActiveTip && closeActiveTip !== close) closeActiveTip();
    closeActiveTip = close;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      if (closeActiveTip === close) closeActiveTip = null;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
    // `close` only touches refs and the state setter, so it is safe to capture once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => clearLeaveTimer, []);

  const openFromIcon = () => { clearLeaveTimer(); setOpen(true); };
  const closeOnLeave = () => {
    if (pinned.current) return;
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => setOpen(false), LEAVE_DELAY_MS);
  };
  const focusVisible = (element: HTMLElement) => {
    try { return element.matches(':focus-visible'); } catch { return false; }
  };

  return (
    <span
      className={open ? 'admin-help admin-help--open' : 'admin-help'}
      ref={rootRef}
      onMouseLeave={closeOnLeave}
      onMouseEnter={clearLeaveTimer}
    >
      <button
        type="button"
        className="admin-help__btn"
        aria-label={t('admin.checklists.helpLabel', 'Hint: {{name}}', { name })}
        aria-expanded={open}
        aria-describedby={tipId}
        onMouseEnter={openFromIcon}
        onFocus={(event) => { if (focusVisible(event.currentTarget)) openFromIcon(); }}
        onBlur={() => { if (!pinned.current) closeOnLeave(); }}
        onClick={() => {
          if (open && pinned.current) { close(); return; }
          pinned.current = true;
          openFromIcon();
        }}
      >
        <span className="admin-help__icon" aria-hidden="true">?</span>
      </button>
      <span role="tooltip" id={tipId} className="admin-help__tip">{children}</span>
    </span>
  );
}

/** Checkbox on one line (box, name, "?") whose explanation lives in the popup hint. */
export function ChecklistCheckboxOption({ label, hint, checked, disabled, onChange }: {
  label: string;
  hint: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="admin-option">
      <label className="admin-option__label">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
      <ChecklistHelpTip name={label}>{hint}</ChecklistHelpTip>
    </div>
  );
}
