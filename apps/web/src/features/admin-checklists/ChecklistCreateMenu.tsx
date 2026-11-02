import { useId } from 'react';
import type { TFunction } from 'i18next';

import { Menu } from '../../shared/ui.js';

/**
 * PR 409: the one "+ Create" button of the library. Its menu offers a folder (in a small dialog) and a checklist, both
 * created inside the open folder. "From template" stays a separate button next to it. The menu is the shared `Menu`:
 * a click opens it, arrows, Home and End move, Enter chooses, Escape and an outside click close it.
 */
export function ChecklistCreateMenu({ canCreateFolder, onCreateFolder, onCreateChecklist, t }: {
  /** False at the deepest level: a folder cannot be nested deeper than five levels. */
  canCreateFolder: boolean;
  onCreateFolder: () => void;
  onCreateChecklist: () => void;
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
      <button onClick={onCreateChecklist} role="menuitem" type="button">{t('admin.checklists.createMenu.checklist', 'Checklist')}</button>
    </Menu>
  );
}
