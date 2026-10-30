import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** "?" button with a popup hint: opens on hover, keyboard focus or tap; closes on Escape or an outside tap. */
export function ChecklistHelpTip({ name, children }: { name: string; children: ReactNode }) {
  const { t } = useTranslation();
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <span className={open ? 'admin-help admin-help--open' : 'admin-help'} ref={rootRef}>
      <button
        type="button"
        className="admin-help__btn"
        aria-label={t('admin.checklists.helpLabel', 'Hint: {{name}}', { name })}
        aria-expanded={open}
        aria-describedby={tipId}
        onClick={() => setOpen((value) => !value)}
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
