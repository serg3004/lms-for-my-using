import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { TFunction } from 'i18next';

import { FOLDER_COLORS, type FolderColor } from '@lms/shared/constants/folder-colors';
import { Button, Dialog } from '../ui.js';
import { ContextMenu, useContextMenu } from '../ContextMenu.js';
import { MAX_FOLDER_DEPTH, folderAndDescendantIds, type FolderNode } from './folderTree.js';
import { FolderGlyph, FolderTreeRows } from './FolderTree.js';

export type FolderShareUser = { id: string; name: string };
type DialogFolder = FolderNode & { visibleToStaff?: boolean; accessRoles?: string[]; color?: FolderColor; canManage?: boolean; sharedUsers?: FolderShareUser[] };
export type FolderDialogTarget<F extends DialogFolder = DialogFolder> =
  | { kind: 'create'; parent: F | null }
  | { kind: 'edit'; folder: F };

/** Creates or renames a folder with the settings available in its library. */
export function FolderDialog<F extends DialogFolder>({ target, onClose, onSubmit, t, rootLabel, colors = false, colorChoice = false, access = false, roleOptions = [], shareSearch }: {
  target: FolderDialogTarget<F> | null;
  rootLabel?: string;
  /** Assessment folders: a colour and no "visible to staff" flag. */
  colors?: boolean;
  /** PR 515: checklist folders keep the flag and get a colour as well. */
  colorChoice?: boolean;
  /** PR 576: sections with a colour only (tests, courses, assignments, materials) also show who the folder is open to. */
  access?: boolean;
  /** PR 576: roles that can be chosen instead of "all employees". */
  roleOptions?: readonly string[];
  /** PR 515: with it the dialog lets the manager open the folder to named employees; it searches them. */
  shareSearch?: (term: string) => Promise<FolderShareUser[]>;
  onClose: () => void;
  onSubmit: (values: { name: string; visibleToStaff: boolean; accessRoles: string[]; color: FolderColor; sharedUsers: FolderShareUser[] }) => Promise<void>;
  t: TFunction;
}) {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<FolderColor>('purple');
  const [visibleToStaff, setVisibleToStaff] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [shared, setShared] = useState<FolderShareUser[]>([]);
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<FolderShareUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setName(target.kind === 'edit' ? target.folder.name : '');
    setVisibleToStaff(target.kind === 'edit' ? target.folder.visibleToStaff ?? false : false);
    setRoles(target.kind === 'edit' ? target.folder.accessRoles ?? [] : []);
    setColor(target.kind === 'edit' ? target.folder.color ?? 'purple' : 'purple');
    setShared(target.kind === 'edit' ? target.folder.sharedUsers ?? [] : []);
    setTerm('');
    setFound([]);
    setError(null);
    setBusy(false);
  }, [target]);

  useEffect(() => {
    if (!shareSearch || !target || term.trim().length < 2) { setFound([]); return; }
    let current = true;
    const timer = setTimeout(() => { void shareSearch(term.trim()).then((users) => { if (current) setFound(users); }).catch(() => { if (current) setFound([]); }); }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [term, shareSearch, target]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), visibleToStaff, accessRoles: visibleToStaff ? [] : roles, color, sharedUsers: shared });
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
        {(!colors || access) && <>
          <label className="admin-checkbox-field">
            <input checked={visibleToStaff} onChange={(event) => setVisibleToStaff(event.target.checked)} type="checkbox" />
            {t('admin.checklists.folders.visibleToStaff', 'Visible to all roles except the learner')}
          </label>
          {!visibleToStaff && roleOptions.length > 0 && <fieldset className="folder-roles">
            <legend>{t('admin.checklists.folders.rolesTitle', 'Or only these roles')}</legend>
            {roleOptions.map((role) => <label className="admin-checkbox-field" key={role}>
              <input checked={roles.includes(role)} onChange={(event) => setRoles(event.target.checked ? [...roles, role] : roles.filter((value) => value !== role))} type="checkbox" />
              {t(`admin.checklists.folders.roles.${role}`, role)}
            </label>)}
          </fieldset>}
          <p className="admin-form__hint">{t('admin.checklists.folders.visibleHint', 'Without the flag the folder is visible only to its creator and administrators. A learner never sees folders.')}</p>
        </>}
        {shareSearch && <fieldset className="folder-share">
          <legend>{t('admin.checklists.folders.shareTitle', 'Open to employees by name')}</legend>
          <p className="admin-form__hint">{t('admin.checklists.folders.shareHint', 'These employees see the folder and its checklists even when it is not visible to all roles. Only staff of the organization can be added.')}</p>
          {shared.length > 0 && <ul className="folder-share__chosen">
            {shared.map((user) => <li key={user.id}>
              <span>{user.name}</span>
              <button aria-label={t('admin.checklists.folders.shareRemove', 'Remove: {{name}}', { name: user.name })} className="folder-share__remove" onClick={() => setShared(shared.filter((entry) => entry.id !== user.id))} type="button">×</button>
            </li>)}
          </ul>}
          <input aria-label={t('admin.checklists.folders.shareSearch', 'Find an employee')} onChange={(event) => setTerm(event.target.value)} placeholder={t('admin.checklists.folders.shareSearch', 'Find an employee')} type="search" value={term} />
          {found.filter((user) => !shared.some((entry) => entry.id === user.id)).length > 0 && <ul className="folder-share__found">
            {found.filter((user) => !shared.some((entry) => entry.id === user.id)).map((user) => <li key={user.id}>
              <button className="ds-button ds-button--secondary ds-button--sm" onClick={() => { setShared([...shared, user]); setTerm(''); setFound([]); }} type="button">{t('admin.checklists.folders.shareAdd', 'Add: {{name}}', { name: user.name })}</button>
            </li>)}
          </ul>}
        </fieldset>}
        {(colors || colorChoice) && <fieldset className="folder-colors">
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
