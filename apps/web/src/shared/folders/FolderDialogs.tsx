import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { TFunction } from 'i18next';

import { FOLDER_COLORS, type FolderColor } from '@lms/shared/constants/folder-colors';
import { Button, Dialog } from '../ui.js';
import { ContextMenu, useContextMenu } from '../ContextMenu.js';
import { MAX_FOLDER_DEPTH, folderAndDescendantIds, type FolderNode } from './folderTree.js';
import { FolderGlyph, FolderTreeRows } from './FolderTree.js';

type DialogFolder = FolderNode & { visibleToStaff?: boolean; color?: FolderColor; canManage?: boolean };
export type FolderDialogTarget<F extends DialogFolder = DialogFolder> =
  | { kind: 'create'; parent: F | null }
  | { kind: 'edit'; folder: F };

/** Creates or renames a folder with the settings available in its library. */
export function FolderDialog<F extends DialogFolder>({ target, onClose, onSubmit, t, rootLabel, colors = false }: {
  target: FolderDialogTarget<F> | null;
  rootLabel?: string;
  colors?: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; visibleToStaff: boolean; color: FolderColor }) => Promise<void>;
  t: TFunction;
}) {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<FolderColor>('purple');
  const [visibleToStaff, setVisibleToStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setName(target.kind === 'edit' ? target.folder.name : '');
    setVisibleToStaff(target.kind === 'edit' ? target.folder.visibleToStaff ?? false : false);
    setColor(target.kind === 'edit' ? target.folder.color ?? 'purple' : 'purple');
    setError(null);
    setBusy(false);
  }, [target]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), visibleToStaff, color });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  }

  const title = !target ? '' : target.kind === 'edit'
    ? t('admin.checklists.folders.editTitle', 'Folder settings')
    : t('admin.checklists.folders.createTitle', 'Create folder');

  return (
    <Dialog initialFocusRef={nameRef} labelledBy={titleId} onClose={onClose} open={target !== null}>
      <form onSubmit={(event) => void submit(event)}>
        <h2 id={titleId}>{title}</h2>
        {target?.kind === 'create' && <p className="admin-form__hint">{target.parent ? t('admin.checklists.folders.createIn', 'The folder will be created in "{{name}}".', { name: target.parent.name }) : rootLabel ? t('admin.assessmentBuilder.folders.createInRoot', { root: rootLabel }) : t('admin.checklists.folders.createInRoot', 'The folder will be created at the top level (All checklists).')}</p>}
        {error && <p className="learner-quiz__submit-error" role="alert">{error}</p>}
        <div className="admin-form__field">
          <label htmlFor={`${titleId}-name`}>{t('admin.checklists.folders.name', 'Folder name')}</label>
          <input id={`${titleId}-name`} maxLength={colors ? 200 : 255} onChange={(event) => setName(event.target.value)} ref={nameRef} required value={name} />
        </div>
        {!colors && <>
          <label className="admin-checkbox-field">
            <input checked={visibleToStaff} onChange={(event) => setVisibleToStaff(event.target.checked)} type="checkbox" />
            {t('admin.checklists.folders.visibleToStaff', 'Visible to all roles except the learner')}
          </label>
          <p className="admin-form__hint">{t('admin.checklists.folders.visibleHint', 'Without the flag the folder is visible only to its creator and administrators. A learner never sees folders.')}</p>
        </>}
        {colors && <fieldset className="folder-colors">
          <legend>{t('admin.assessmentBuilder.folders.color')}</legend>
          {FOLDER_COLORS.map((value) => <label className="folder-colors__option" key={value}>
            <input checked={color === value} name={`${titleId}-color`} onChange={() => setColor(value)} type="radio" />
            <FolderGlyph color={value} />
            <span className="ui-visually-hidden">{t(`admin.assessmentBuilder.folders.colors.${value}`)}</span>
          </label>)}
        </fieldset>}
        <div className="ds-dialog__actions">
          <Button onClick={onClose} type="button" variant="secondary">{t('admin.checklists.cancel', 'Cancel')}</Button>
          <Button disabled={busy || !name.trim()} type="submit" variant="primary">{target?.kind === 'create' ? t('admin.checklists.folders.createSubmit', 'Create') : t('admin.checklists.folders.save', 'Save')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** "Move to folder…": the root and the tree as a list of choices. */
export function MoveToFolderDialog<F extends DialogFolder>({ rootLabel, busy, open, count, folders, currentFolderId, title, excludeFolderIds, onRenameFolder, onCreateFolder, onClose, onMove, t }: {
  open: boolean;
  rootLabel?: string;
  busy?: boolean;
  count: number;
  /** PR 408/410: replaces the default "Move N checklist(s)" title (folders are being moved too). */
  title?: string;
  /** The moved folders: neither they nor anything below them can be the target. */
  excludeFolderIds?: readonly string[];
  folders: F[];
  /** PR 411: the context menu of the list (right button, menu key, Shift+F10, long press); deleting is deliberately absent here. */
  onRenameFolder?: (folder: F) => void;
  onCreateFolder?: (parent: F | null) => void;
  /** Preselected: the folder all the moved sheets share, or null (root). */
  currentFolderId: string | null;
  onClose: () => void;
  onMove: (folderId: string | null) => void;
  t: TFunction;
}) {
  const titleId = useId();
  const [choice, setChoice] = useState<string | null>(currentFolderId);
  useEffect(() => { if (open) setChoice(currentFolderId); }, [open, currentFolderId]);
  const menu = useContextMenu<{ kind: 'folder'; folder: F; level: number } | { kind: 'root' }>();
  const blocked = new Set((excludeFolderIds ?? []).flatMap((id) => [...folderAndDescendantIds(folders, id)]));

  return (
    <Dialog labelledBy={titleId} onClose={onClose} open={open}>
      <h2 id={titleId}>{title ?? t('admin.checklists.folders.moveTitle', 'Move {{count}} checklist(s) to a folder', { count })}</h2>
      <div role="radiogroup" aria-labelledby={titleId} onContextMenu={onCreateFolder ? menu.triggerProps({ kind: 'root' }).onContextMenu : undefined}>
        <label className="admin-checkbox-field" {...(onCreateFolder ? menu.triggerProps({ kind: 'root' }) : {})}>
          <input checked={choice === null} name={`${titleId}-folder`} onChange={() => setChoice(null)} type="radio" />
          {rootLabel ?? t('admin.checklists.folders.all', 'All checklists')}
        </label>
        <FolderTreeRows folders={folders} hidden={blocked} render={({ folder, level }) => (
          <label className="admin-checkbox-field" key={folder.id} style={{ paddingInlineStart: `${level * 16}px` }} {...(onRenameFolder || onCreateFolder ? menu.triggerProps({ kind: 'folder', folder, level }) : {})}>
            <input checked={choice === folder.id} name={`${titleId}-folder`} onChange={() => setChoice(folder.id)} type="radio" />
            {folder.color && <FolderGlyph color={folder.color} />}{folder.name}
          </label>
        )} />
      </div>
      <ContextMenu
        label={menu.state?.target.kind === 'folder'
          ? t('admin.checklists.contextMenu.rowLabel', 'Actions: {{name}}', { name: menu.state.target.folder.name })
          : t('admin.checklists.contextMenu.treeLabel', 'Folder list actions')}
        onClose={menu.close}
        state={menu.state}
      >
        {menu.state?.target.kind === 'folder' ? (() => {
          const { folder, level } = menu.state.target;
          return (
            <>
              <button onClick={() => setChoice(folder.id)} role="menuitem" type="button">{t('admin.checklists.contextMenu.choose', 'Choose this folder')}</button>
              {folder.canManage && onRenameFolder && <button onClick={() => onRenameFolder(folder)} role="menuitem" type="button">{t('admin.checklists.folders.renameFolder', 'Rename folder')}</button>}
              {onCreateFolder && <button disabled={level >= MAX_FOLDER_DEPTH} onClick={() => onCreateFolder(folder)} role="menuitem" type="button">{t('admin.checklists.contextMenu.newInside', 'New folder inside')}</button>}
            </>
          );
        })() : onCreateFolder ? <button onClick={() => onCreateFolder(null)} role="menuitem" type="button">{t('admin.checklists.contextMenu.newFolder', 'New folder')}</button> : null}
      </ContextMenu>
      <div className="ds-dialog__actions">
        <Button onClick={onClose} type="button" variant="secondary">{t('admin.checklists.cancel', 'Cancel')}</Button>
        <Button disabled={busy || (choice !== null && (blocked.has(choice) || !folders.some(({ id }) => id === choice)))} onClick={() => onMove(choice)} type="button" variant="primary">{t('admin.checklists.folders.moveHere', 'Move')}</Button>
      </div>
    </Dialog>
  );
}
