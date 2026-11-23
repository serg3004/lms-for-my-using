import { useId } from 'react';
import type { TFunction } from 'i18next';

import { Menu } from '../ui.js';

/**
 * The one "+ Create" button of a folder library (checklists since PR 409, tests since PR 574). Its menu offers a folder and
 * the library's own item, both created inside the open folder. The menu is the shared `Menu`: a click opens it, arrows, Home
 * and End move, Enter chooses, Escape and an outside click close it.
 */
export function FolderCreateMenu({ canCreateFolder, onCreateFolder, onCreateItem, itemLabel, t }: {
  /** False at the deepest level: a folder cannot be nested deeper than five levels. */
  canCreateFolder: boolean;
  onCreateFolder: () => void;
  onCreateItem: () => void;
  itemLabel: string;
  t: TFunction;
}) {
  const hintId = useId();
  return (
    <Menu
      align="end"
      buttonClassName="ds-button ds-button--primary ds-button--md checklist-create-button"
      label={<><span aria-hidden="true">+</span><span style={{ marginInlineStart: 6 }}>{t('admin.checklists.createMenu.label', 'Create')}</span></>}
    >
      <button aria-describedby={canCreateFolder ? undefined : hintId} disabled={!canCreateFolder} onClick={onCreateFolder} role="menuitem" type="button">
        {t('admin.checklists.createMenu.folder', 'Folder…')}
      </button>
      {!canCreateFolder && <p className="ds-menu__hint" id={hintId} role="note">{t('admin.checklists.createMenu.depthHint', 'The deepest level: folders can be nested at most 5 levels deep.')}</p>}
      <button onClick={onCreateItem} role="menuitem" type="button">{itemLabel}</button>
    </Menu>
  );
}
