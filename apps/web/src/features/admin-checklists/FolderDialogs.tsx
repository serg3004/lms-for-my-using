import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { TFunction } from 'i18next';

import type { ChecklistFolder } from '../../shared/api/types.js';
import { Button, Dialog } from '../../shared/ui.js';
import { folderRows } from './folders.js';

export type FolderDialogTarget =
  | { kind: 'create'; parent: ChecklistFolder | null }
  | { kind: 'edit'; folder: ChecklistFolder };

/** PR 396: creates or renames a folder and sets its "visible to all roles except the learner" flag (shown to those who manage the folder, i.e. always here). */
export function FolderDialog({ target, onClose, onSubmit, t }: {
  target: FolderDialogTarget | null;
  onClose: () => void;
  onSubmit: (values: { name: string; visibleToStaff: boolean }) => Promise<void>;
  t: TFunction;
}) {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [visibleToStaff, setVisibleToStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setName(target.kind === 'edit' ? target.folder.name : '');
    setVisibleToStaff(target.kind === 'edit' ? target.folder.visibleToStaff : false);
    setError(null);
    setBusy(false);
  }, [target]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), visibleToStaff });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  }

  const title = !target ? '' : target.kind === 'edit'
    ? t('admin.checklists.folders.editTitle', 'Folder settings')
    : target.parent
      ? t('admin.checklists.folders.newSubTitle', 'New subfolder in "{{name}}"', { name: target.parent.name })
      : t('admin.checklists.folders.newTitle', 'New folder');

  return (
    <Dialog initialFocusRef={nameRef} labelledBy={titleId} onClose={onClose} open={target !== null}>
      <form onSubmit={(event) => void submit(event)}>
        <h2 id={titleId}>{title}</h2>
        {error && <p className="learner-quiz__submit-error" role="alert">{error}</p>}
        <div className="admin-form__field">
          <label htmlFor={`${titleId}-name`}>{t('admin.checklists.folders.name', 'Folder name')}</label>
          <input id={`${titleId}-name`} maxLength={255} onChange={(event) => setName(event.target.value)} ref={nameRef} required value={name} />
        </div>
        <label className="admin-checkbox-field">
          <input checked={visibleToStaff} onChange={(event) => setVisibleToStaff(event.target.checked)} type="checkbox" />
          {t('admin.checklists.folders.visibleToStaff', 'Visible to all roles except the learner')}
        </label>
        <p className="admin-form__hint">{t('admin.checklists.folders.visibleHint', 'Without the flag the folder is visible only to its creator and administrators. A learner never sees folders.')}</p>
        <div className="ds-dialog__actions">
          <Button onClick={onClose} type="button" variant="secondary">{t('admin.checklists.cancel', 'Cancel')}</Button>
          <Button disabled={busy || !name.trim()} type="submit" variant="primary">{t('admin.checklists.folders.save', 'Save')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** "Move to folder…": the root and the tree as a list of choices. */
export function MoveToFolderDialog({ open, count, folders, currentFolderId, onClose, onMove, t }: {
  open: boolean;
  count: number;
  folders: ChecklistFolder[];
  /** Preselected: the folder all the moved sheets share, or null (root). */
  currentFolderId: string | null;
  onClose: () => void;
  onMove: (folderId: string | null) => void;
  t: TFunction;
}) {
  const titleId = useId();
  const [choice, setChoice] = useState<string | null>(currentFolderId);
  useEffect(() => { if (open) setChoice(currentFolderId); }, [open, currentFolderId]);
  const rows = folderRows(folders, 'all');

  return (
    <Dialog labelledBy={titleId} onClose={onClose} open={open}>
      <h2 id={titleId}>{t('admin.checklists.folders.moveTitle', 'Move {{count}} checklist(s) to a folder', { count })}</h2>
      <div role="radiogroup" aria-labelledby={titleId}>
        <label className="admin-checkbox-field">
          <input checked={choice === null} name={`${titleId}-folder`} onChange={() => setChoice(null)} type="radio" />
          {t('admin.checklists.folders.all', 'All checklists')}
        </label>
        {rows.map(({ folder, level }) => (
          <label className="admin-checkbox-field" key={folder.id} style={{ paddingInlineStart: `${level * 16}px` }}>
            <input checked={choice === folder.id} name={`${titleId}-folder`} onChange={() => setChoice(folder.id)} type="radio" />
            {folder.name}
          </label>
        ))}
      </div>
      <div className="ds-dialog__actions">
        <Button onClick={onClose} type="button" variant="secondary">{t('admin.checklists.cancel', 'Cancel')}</Button>
        <Button onClick={() => onMove(choice)} type="button" variant="primary">{t('admin.checklists.folders.moveHere', 'Move')}</Button>
      </div>
    </Dialog>
  );
}
