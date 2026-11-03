import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { TFunction } from 'i18next';

import { Button } from '../../shared/ui.js';

/**
 * PR 413: a name that is edited in place (a group title, a criterion text, a field label). The text lives in the field
 * until it is committed (leaving the field or Enter), so every state is visible: "Saving…", "Saved" for a moment, or the
 * reason it was not saved, next to the field, with the typed text kept and a "Retry" button. Esc puts the old name back.
 * An empty name is never saved, and the field does not swap in a default while the text is being retyped.
 */
export function InlineNameField({ id, value, label, maxLength, multiline = false, rows = 2, disabled, className, wrapperClassName, hintWhenEmpty = false, validate, onCommit, t }: {
  /** DOM id: "Rename" in a menu focuses the field through `focusNameField(id)`. */
  id: string;
  /** The saved name. */
  value: string;
  /** Accessible name of the field. */
  label: string;
  maxLength: number;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
  className?: string;
  /** Class of the wrapper: it is the grid item of the row the field stands in. */
  wrapperClassName?: string;
  /** A field that was just added has no name yet: say so before the first blur. */
  hintWhenEmpty?: boolean;
  /** Extra rules (a duplicate title); returns the message to show, or null. */
  validate?: (name: string) => string | null;
  /** Saves the trimmed name; a rejection is shown next to the field. */
  onCommit: (name: string) => Promise<void>;
  t: TFunction;
}) {
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [retryable, setRetryable] = useState(false);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const cancelled = useRef(false);
  const timer = useRef<number | null>(null);

  // A change from outside (a reload, a copy) replaces the text unless the user is typing or the save failed.
  const statusRef = useRef(status);
  statusRef.current = status;
  useEffect(() => {
    if (document.activeElement !== fieldRef.current && (statusRef.current === 'idle' || statusRef.current === 'saved')) setDraft(value);
  }, [value]);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  async function commit() {
    if (cancelled.current) { cancelled.current = false; return; }
    const next = draft.trim();
    if (next === value && status !== 'error') { setDraft(value); return; }
    const problem = !next
      ? t('admin.checklists.rename.required', 'Enter a name')
      : next.length > maxLength
        ? t('admin.checklists.rename.tooLong', 'No more than {{max}} characters', { max: maxLength })
        : validate?.(next) ?? null;
    if (problem) { setStatus('error'); setMessage(problem); setRetryable(false); return; }
    if (next === value) { setStatus('idle'); setDraft(value); return; }
    setStatus('saving');
    setMessage('');
    try {
      await onCommit(next);
      setDraft(next);
      setStatus('saved');
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setStatus((current) => (current === 'saved' ? 'idle' : current)), 2500);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error && error.message ? error.message : t('admin.checklists.rename.failed', 'Unable to save the name.'));
      setRetryable(true);
    }
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      cancelled.current = true;
      setDraft(value);
      setStatus('idle');
      event.currentTarget.blur();
      // A blur that does not happen (the field was not focused) must not leave the flag set.
      window.setTimeout(() => { cancelled.current = false; }, 0);
    }
  }

  const empty = draft.trim() === '' && status === 'idle';
  const shown = status === 'idle' && hintWhenEmpty && empty ? t('admin.checklists.rename.required', 'Enter a name') : status === 'saving' ? t('admin.checklists.rename.saving', 'Saving…') : status === 'saved' ? t('admin.checklists.rename.saved', 'Saved') : status === 'error' ? message : '';
  const invalid = status === 'error' || (hintWhenEmpty && empty);
  const common = {
    id,
    ref: fieldRef,
    className: ['admin-name-field__input', className].filter(Boolean).join(' '),
    value: draft,
    disabled,
    'aria-label': label,
    'aria-invalid': invalid || undefined,
    'aria-describedby': shown ? `${id}-status` : undefined,
    onChange: (event: { target: { value: string } }) => { setDraft(event.target.value); if (status === 'error' || status === 'saved') setStatus('idle'); },
    onBlur: () => void commit(),
    onKeyDown: keyDown,
    onDoubleClick: () => fieldRef.current?.select(),
  };
  return (
    <span className={['admin-name-field', wrapperClassName].filter(Boolean).join(' ')}>
      {multiline ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />}
      <span className={`admin-name-field__status${invalid ? ' admin-name-field__status--error' : ''}`} id={`${id}-status`} role="status" aria-live="polite">
        {shown}
        {status === 'error' && retryable && <> <Button onClick={() => void commit()} size="sm" type="button" variant="secondary">{t('admin.checklists.rename.retry', 'Retry')}</Button></>}
      </span>
    </span>
  );
}

/** "Rename" from a menu: puts the cursor in the name field and selects its text (after the menu has given the focus back). */
export function focusNameField(id: string) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const field = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!field) return;
    field.scrollIntoView?.({ block: 'nearest' });
    field.focus();
    field.select();
  }));
}
