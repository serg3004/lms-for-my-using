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

export function FolderGlyph({ color = 'purple' }: { color?: FolderColor }) {
  return <span className={`folder-glyph folder-glyph--${color}`} aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
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
