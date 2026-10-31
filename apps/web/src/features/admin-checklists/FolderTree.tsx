import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { TFunction } from 'i18next';

import type { ChecklistFolder } from '../../shared/api/types.js';
import { Menu } from '../../shared/ui.js';
import { MAX_FOLDER_DEPTH, folderRows } from './folders.js';

/** Id of the first row, "All checklists" (the root of the tree). */
export const ALL_FOLDERS = '__all__';

export function FolderTree({ folders, totalCount, selectedId, expandedIds, onSelect, onToggle, onCreateSubfolder, onEdit, onDelete, t }: {
  folders: ChecklistFolder[];
  totalCount: number;
  /** The selected folder, or null for "All checklists". */
  selectedId: string | null;
  expandedIds: ReadonlySet<string>;
  onSelect: (folderId: string | null) => void;
  onToggle: (folderId: string) => void;
  onCreateSubfolder: (folder: ChecklistFolder) => void;
  onEdit: (folder: ChecklistFolder) => void;
  onDelete: (folder: ChecklistFolder) => void;
  t: TFunction;
}) {
  const rows = folderRows(folders, expandedIds);
  const order = [ALL_FOLDERS, ...rows.map((row) => row.folder.id)];
  const current = selectedId ?? ALL_FOLDERS;
  const refs = useRef(new Map<string, HTMLDivElement>());
  const focusAfterSelect = useRef(false);

  useEffect(() => {
    if (focusAfterSelect.current) {
      focusAfterSelect.current = false;
      refs.current.get(current)?.focus();
    }
  }, [current]);

  function select(id: string) {
    focusAfterSelect.current = true;
    onSelect(id === ALL_FOLDERS ? null : id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keys pressed on the row menu or the expand button are theirs.
    if (event.target instanceof HTMLElement && event.target.closest('button, [role="menu"]')) return;
    const index = order.indexOf(current);
    const row = rows.find((candidate) => candidate.folder.id === current);
    if (event.key === 'ArrowDown') { event.preventDefault(); select(order[Math.min(index + 1, order.length - 1)]!); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); select(order[Math.max(index - 1, 0)]!); }
    else if (event.key === 'Home') { event.preventDefault(); select(order[0]!); }
    else if (event.key === 'End') { event.preventDefault(); select(order.at(-1)!); }
    else if (event.key === 'ArrowRight' && row?.hasChildren) {
      event.preventDefault();
      if (!expandedIds.has(current)) onToggle(current);
      else select(order[index + 1]!);
    } else if (event.key === 'ArrowLeft' && row) {
      event.preventDefault();
      if (row.hasChildren && expandedIds.has(current)) onToggle(current);
      else if (row.folder.parentId) select(row.folder.parentId);
    }
  }

  return (
    <div aria-label={t('admin.checklists.folders.treeLabel', 'Checklist folders')} className="admin-departments-tree checklist-folders__tree" onKeyDown={handleKeyDown} role="tree">
      <div
        aria-level={1}
        aria-selected={current === ALL_FOLDERS}
        className="admin-departments-tree__node"
        ref={(element) => { if (element) refs.current.set(ALL_FOLDERS, element); else refs.current.delete(ALL_FOLDERS); }}
        role="treeitem"
        tabIndex={current === ALL_FOLDERS ? 0 : -1}
      >
        <div className={`admin-departments-tree__item${current === ALL_FOLDERS ? ' admin-departments-tree__item--selected' : ''}`} onClick={() => select(ALL_FOLDERS)}>
          <span aria-hidden="true" className="admin-departments-tree__twisty" />
          <span className="admin-departments-tree__label">{t('admin.checklists.folders.all', 'All checklists')}</span>
          <span className="admin-departments-tree__type">{totalCount}</span>
        </div>
      </div>
      {rows.map(({ folder, level, hasChildren }) => {
        const expanded = expandedIds.has(folder.id);
        const selected = current === folder.id;
        return (
          <div
            aria-expanded={hasChildren ? expanded : undefined}
            aria-level={level + 1}
            aria-selected={selected}
            className="admin-departments-tree__node"
            key={folder.id}
            ref={(element) => { if (element) refs.current.set(folder.id, element); else refs.current.delete(folder.id); }}
            role="treeitem"
            tabIndex={selected ? 0 : -1}
          >
            <div className={`admin-departments-tree__item${selected ? ' admin-departments-tree__item--selected' : ''}`} onClick={() => select(folder.id)} style={{ paddingInlineStart: `${level * 16}px` }}>
              {hasChildren ? (
                <button
                  aria-label={expanded ? t('admin.departments.collapse', 'Collapse') : t('admin.departments.expand', 'Expand')}
                  className={`admin-departments-tree__twisty${expanded ? ' admin-departments-tree__twisty--open' : ''}`}
                  onClick={(event) => { event.stopPropagation(); onToggle(folder.id); }}
                  type="button"
                >
                  <svg aria-hidden="true" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              ) : <span aria-hidden="true" className="admin-departments-tree__twisty" />}
              <span className="admin-departments-tree__label">{folder.name}</span>
              {!folder.visibleToStaff && (
                <span role="img" aria-label={t('admin.checklists.folders.closed', 'Closed folder: visible only to its creator and administrators')} title={t('admin.checklists.folders.closed', 'Closed folder: visible only to its creator and administrators')}>🔒</span>
              )}
              <span className="admin-departments-tree__type">{folder.totalChecklistCount}</span>
              {folder.canManage && (
                <span onClick={(event) => event.stopPropagation()}>
                  <Menu
                    align="end"
                    buttonClassName="ds-button ds-button--secondary ds-button--sm"
                    label={<><span aria-hidden="true">⋮</span><span className="ui-visually-hidden">{t('admin.checklists.folders.actions', 'Folder actions: {{name}}', { name: folder.name })}</span></>}
                  >
                    <button onClick={() => onEdit(folder)} role="menuitem" type="button">{t('admin.checklists.folders.rename', 'Rename')}</button>
                    {level < MAX_FOLDER_DEPTH && (
                      <button onClick={() => onCreateSubfolder(folder)} role="menuitem" type="button">{t('admin.checklists.folders.newSub', 'New subfolder')}</button>
                    )}
                    <button onClick={() => onDelete(folder)} role="menuitem" type="button">{t('admin.checklists.folders.delete', 'Delete')}</button>
                  </Menu>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
