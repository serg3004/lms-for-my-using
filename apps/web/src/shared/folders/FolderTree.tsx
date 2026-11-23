import { Fragment, type ReactNode } from 'react';
import type { FolderColor } from '@lms/shared/constants/folder-colors';
import { folderRows, type FolderNode, type FolderRow } from './folderTree.js';

export function FolderTreeRows<F extends FolderNode>({ folders, expanded = 'all', hidden, render }: {
  folders: readonly F[];
  expanded?: ReadonlySet<string> | 'all';
  hidden?: ReadonlySet<string>;
  render: (row: FolderRow<F>) => ReactNode;
}) {
  return folderRows(folders, expanded).map((row) => hidden?.has(row.folder.id) ? null :
    <Fragment key={row.folder.id}>{render(row)}</Fragment>);
}

/** The folder icon of every library: a filled folder with a tab, in the chosen colour (checklists use the default one). */
export function FolderGlyph({ color = 'purple' }: { color?: FolderColor }) {
  return <span className={`folder-glyph folder-glyph--${color}`} aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.5 6.5A2.5 2.5 0 0 1 5 4h4.2c.6 0 1.1.3 1.5.7L12 6h7a2.5 2.5 0 0 1 2.5 2.5V10h-19Z" opacity=".55" />
      <path d="M2.5 9.5A1.5 1.5 0 0 1 4 8h16a1.5 1.5 0 0 1 1.5 1.5v8A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5Z" />
    </svg>
  </span>;
}

export function FolderBreadcrumbs<F extends FolderNode & { color?: FolderColor }>({ folders, label, rootLabel, onSelect }: {
  folders: readonly F[];
  label: string;
  rootLabel: string;
  onSelect: (id: string | null) => void;
}) {
  return <nav aria-label={label}>
    <ol className="checklist-folders__crumbs">
      <li>{folders.length === 0 ? <b aria-current="page">{rootLabel}</b> : <button className="ds-button ds-button--secondary ds-button--sm" onClick={() => onSelect(null)} type="button">{rootLabel}</button>}</li>
      {folders.map((folder, index) => {
        const title = <>{folder.color && <FolderGlyph color={folder.color} />}{folder.name}</>;
        return <li key={folder.id}>
          <span aria-hidden="true">› </span>
          {index === folders.length - 1 ? <b aria-current="page">{title}</b> : <button className="ds-button ds-button--secondary ds-button--sm" onClick={() => onSelect(folder.id)} type="button">{title}</button>}
        </li>;
      })}
    </ol>
  </nav>;
}
