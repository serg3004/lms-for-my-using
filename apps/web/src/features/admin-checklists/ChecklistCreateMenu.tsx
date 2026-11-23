import type { TFunction } from 'i18next';

import { FolderCreateMenu } from '../../shared/folders/FolderCreateMenu.js';

/** PR 409: the one "+ Create" button of the checklist library (folder or checklist); the menu itself is shared with the test library. */
export function ChecklistCreateMenu({ canCreateFolder, onCreateFolder, onCreateChecklist, t }: {
  canCreateFolder: boolean;
  onCreateFolder: () => void;
  onCreateChecklist: () => void;
  t: TFunction;
}) {
  return <FolderCreateMenu canCreateFolder={canCreateFolder} itemLabel={t('admin.checklists.createMenu.checklist', 'Checklist')} onCreateFolder={onCreateFolder} onCreateItem={onCreateChecklist} t={t} />;
}
