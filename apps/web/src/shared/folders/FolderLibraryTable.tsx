import { useImperativeHandle, useMemo, useState, type ReactNode, type Ref } from 'react';
import type { TFunction } from 'i18next';

import { bulkLibraryFolders, getLibraryFolderImpact, saveLibraryFolder, type LibraryBulkKind, type LibraryBulkOperation, type LibraryFolder } from '../api/libraryFolders.js';
import { ApiClientError } from '../apiClient.js';
import { ContextMenu, useContextMenu } from '../ContextMenu.js';
import { Button, ConfirmDialog, DataTable, Menu, PageState, type Column } from '../ui.js';
import { FolderDialog, MoveToFolderDialog, type FolderDialogTarget } from './FolderDialogs.js';
import { FolderBulkDelete, FolderBulkMove } from './FolderBulkActions.js';
import { FolderBreadcrumbs, FolderGlyph, FolderTreeRows } from './FolderTree.js';
import { folderDrag } from './folderDrag.js';
import { canAddSubfolder, childrenByParent, folderAndDescendantIds, folderPath } from './folderTree.js';
import type { LibraryFolders } from './useLibraryFolders.js';

type Row<Item> = { kind: 'item'; item: Item } | { kind: 'folder'; item: LibraryFolder };
type Selectable = { id: string; folderId?: string | null };

/** What the page header can ask of the library: the "+ Create → Folder" item opens the folder dialog owned here. */
export type FolderLibraryActions = { createFolder: () => void };

/**
 * PR 581: the list of a section (courses, assignments) with folders, the same as the checklist and test libraries:
 * folder tree and breadcrumbs, folder rows above the items, the row menu (right button, menu key, long press),
 * drag onto a folder, selection with "move" and "delete", and the folder dialog with a colour. The section gives
 * the items already filtered by the open folder and its own columns; this component owns everything about folders.
 * Items are moved between folders but never deleted from here.
 */
export function FolderLibraryTable<Item extends Selectable>({ actionsRef, library, items, columns, itemTitle, showFolders, afterChange, toolbar, footer, emptyMessage, label, t }: {
  actionsRef?: Ref<FolderLibraryActions>;
  library: LibraryFolders;
  items: Item[];
  /** Columns of an item row; the `actions` column of a folder row is added here. */
  columns: Column<Item>[];
  itemTitle: (item: Item) => string;
  /** False while the list is searched: folder rows then stay out of the way. */
  showFolders: boolean;
  /** Called after an item was moved, so the section reloads its own list. */
  afterChange: () => void;
  toolbar?: ReactNode;
  footer?: ReactNode;
  emptyMessage: string;
  label: string;
  t: TFunction;
}) {
  const scope = library.scope;
  const drag = useMemo(() => folderDrag(`application/x-lms-library-${scope}`), [scope]);
  const rowKey = (row: Row<Item>) => `${row.kind}:${row.item.id}`;
  const rowTitle = (row: Row<Item>) => row.kind === 'folder' ? row.item.name : itemTitle(row.item);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<FolderDialogTarget<LibraryFolder> | null>(null);
  const [move, setMove] = useState<Row<Item>[] | null>(null);
  const [deletion, setDeletion] = useState<{ rows: Row<Item>[]; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ done: number; skipped: number; details: { key: string; text: string }[] } | null>(null);
  const menu = useContextMenu<{ key: string }>();

  const folders = useMemo(() => library.data?.folders ?? [], [library.data]);
  const active = folders.find((folder) => folder.id === library.id) ?? null;
  const rootLabel = t(`libraryFolders.${scope}.root`);
  useImperativeHandle(actionsRef, () => ({
    createFolder: () => { if (library.data && !busy && canAddSubfolder(folders, library.id)) setEdit({ kind: 'create', parent: active }); },
  }), [library.data, busy, folders, library.id, active]);

  const rows: Row<Item>[] = [
    ...(showFolders ? (childrenByParent(folders).get(library.id) ?? []).map((item): Row<Item> => ({ kind: 'folder', item })) : []),
    ...items.map((item): Row<Item> => ({ kind: 'item', item })),
  ];
  const rowsByKey = new Map(rows.map((row) => [rowKey(row), row]));
  /** A row outside the selection acts alone; a row inside it acts on the whole selection (as in file managers). */
  const actingRows = (key: string): Row<Item>[] => (selection.has(key) ? [...selection] : [key]).flatMap((id) => rowsByKey.get(id) ?? []);
  const moveFolders = move?.flatMap((row) => row.kind === 'folder' ? [row.item.id] : []) ?? [];
  const moveParents = move?.map((row) => row.kind === 'folder' ? row.item.parentId : row.item.folderId ?? null) ?? [];

  function actionError(failure: unknown) {
    if (failure instanceof ApiClientError) {
      if (failure.status === 409) return t('admin.checklists.folders.errorDuplicate');
      if (failure.status === 404) return t('admin.checklists.folders.errorGone');
      if (failure.status === 403) return t('libraryFolders.forbidden');
      if (failure.status === 400 && /nested/i.test(failure.message)) return t('admin.checklists.folders.errorDepth');
    }
    return t('admin.checklists.folders.errorGeneric');
  }

  async function run(picked: Row<Item>[], operation: LibraryBulkOperation) {
    if (busy || picked.length === 0) return;
    setBusy(true);
    setError(null);
    setReport(null);
    const next = { done: 0, skipped: 0, details: [] as { key: string; text: string }[] };
    const deleted = new Set<string>();
    try {
      // The endpoint accepts up to 100 rows per kind per request.
      for (const kind of ['folder', 'item'] satisfies LibraryBulkKind[]) {
        const targets = picked.filter((row) => row.kind === kind);
        for (let offset = 0; offset < targets.length; offset += 100) {
          const batch = targets.slice(offset, offset + 100);
          const result = await bulkLibraryFolders(scope, kind, batch.map((row) => row.item.id), operation);
          const byId = new Map(batch.map((row) => [row.item.id, row]));
          next.done += result.done;
          next.skipped += result.skipped;
          for (const entry of result.results) {
            if (entry.result === 'done') {
              if (operation.action === 'delete' && kind === 'folder') folderAndDescendantIds(folders, entry.id).forEach((id) => deleted.add(id));
              continue;
            }
            const row = byId.get(entry.id);
            next.details.push({ key: `${kind}:${entry.id}`, text: `${row ? rowTitle(row) : entry.id}: ${t(`admin.checklists.bulk.reason.${entry.reason}`)}` });
          }
        }
      }
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      if (library.id && deleted.has(library.id)) {
        const closest = folderPath(folders, library.id).reverse().find((folder) => !deleted.has(folder.id));
        library.select(closest?.id ?? null, true);
      }
      if (next.done || next.skipped) setReport(next);
      setSelection(new Set());
      setMove(null);
      setDeletion(null);
      try {
        if (next.done || !next.skipped) afterChange();
        await library.reload();
      } catch (failure) { setError(actionError(failure)); }
      setBusy(false);
    }
  }

  async function previewDelete(picked: Row<Item>[]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ids = picked.flatMap((row) => row.kind === 'folder' ? [row.item.id] : []);
      const chosen = new Set(ids);
      const top = ids.filter((id) => !folderPath(folders, id).slice(0, -1).some(({ id: ancestor }) => chosen.has(ancestor)));
      const impacts = await Promise.all(top.map(getLibraryFolderImpact));
      const moved = impacts.flatMap((impact) => impact.movedToRoot);
      const titles = moved.slice(0, 10).map(({ title }) => title).join(', ');
      const names = moved.length > 10 ? `${titles} ${t('admin.checklists.bulk.andMore', { count: moved.length - 10 })}` : titles;
      const messages = [
        t('libraryFolders.deleteFolders', { count: impacts.reduce((sum, item) => sum + item.folders, 0) }),
        moved.length > 0 && t(`libraryFolders.${scope}.unfile`, { count: moved.length, names }),
      ];
      setDeletion({ rows: picked, message: messages.filter(Boolean).join(' ') });
    } catch (failure) { setError(actionError(failure)); }
    finally { setBusy(false); }
  }

  function drop(id: string, parentId: string | null) {
    const item = items.find((candidate) => candidate.id === id);
    if (item && (item.folderId ?? null) !== parentId) void run([{ kind: 'item', item }], { action: 'move', parentId });
  }

  function contextMenuContent() {
    const target = menu.state?.target;
    if (!target) return { label: '', items: null };
    const picked = actingRows(target.key);
    const only = picked.length === 1 ? picked[0] : undefined;
    const onlyFolders = picked.every((row) => row.kind === 'folder');
    if (!only) {
      return {
        label: t('admin.checklists.contextMenu.selectionLabel', { selected: picked.length }),
        items: <>
          <button type="button" role="menuitem" onClick={() => setMove(picked)}>{t('admin.checklists.contextMenu.moveSelection')}</button>
          {onlyFolders && <button type="button" role="menuitem" onClick={() => void previewDelete(picked)}>{t('admin.checklists.contextMenu.deleteSelection')}</button>}
        </>,
      };
    }
    if (only.kind === 'folder') {
      const folder = only.item;
      return {
        label: t('admin.checklists.contextMenu.rowLabel', { name: folder.name }),
        items: <>
          <button type="button" role="menuitem" onClick={() => library.select(folder.id)}>{t('admin.checklists.folders.open')}</button>
          <button type="button" role="menuitem" onClick={() => setEdit({ kind: 'edit', folder })}>{t('libraryFolders.settings')}</button>
          <button type="button" role="menuitem" disabled={!canAddSubfolder(folders, folder.id)} onClick={() => setEdit({ kind: 'create', parent: folder })}>{t('admin.checklists.contextMenu.newInside')}</button>
          <button type="button" role="menuitem" onClick={() => setMove([only])}>{t('admin.checklists.folders.moveOpen')}</button>
          <button type="button" role="menuitem" onClick={() => void previewDelete([only])}>{t('admin.checklists.folders.delete')}</button>
        </>,
      };
    }
    return {
      label: t('admin.checklists.contextMenu.rowLabel', { name: itemTitle(only.item) }),
      items: <button type="button" role="menuitem" onClick={() => setMove([only])}>{t('admin.checklists.folders.moveOpen')}</button>,
    };
  }
  const menuContent = contextMenuContent();

  const tableColumns = columns.map((column): Column<Row<Item>> => ({
    ...column,
    render: (row) => {
      if (row.kind === 'item') return column.render(row.item);
      const folder = row.item;
      if (column.key === columns[0]?.key) return <>
        <span className="checklist-library__folder">
          <FolderGlyph color={folder.color} />
          <button className="checklist-library__open" type="button" onClick={() => library.select(folder.id)}
            aria-label={t('admin.checklists.folders.openFolder', { name: folder.name })}>{folder.name}</button>
        </span>
        <div className="admin-form__hint">{t(`libraryFolders.${scope}.contents`, { folders: folder.childFolderCount, items: folder.itemCount })}</div>
      </>;
      if (column.key === 'actions') return <Menu align="end" buttonClassName="ds-button ds-button--secondary ds-button--sm"
        label={<><span aria-hidden="true">⋮</span><span className="ui-visually-hidden">{t('admin.checklists.folders.actions', { name: folder.name })}</span></>}>
        <button type="button" role="menuitem" onClick={() => setEdit({ kind: 'edit', folder })}>{t('libraryFolders.settings')}</button>
        <button type="button" role="menuitem" disabled={!canAddSubfolder(folders, folder.id)} onClick={() => setEdit({ kind: 'create', parent: folder })}>{t('admin.checklists.contextMenu.newInside')}</button>
        <button type="button" role="menuitem" onClick={() => setMove([row])}>{t('admin.checklists.folders.moveOpen')}</button>
        <button type="button" role="menuitem" onClick={() => void previewDelete([row])}>{t('admin.checklists.folders.delete')}</button>
      </Menu>;
      return null;
    },
  }));

  return <div className="checklist-library">
    {library.status === 'loading' && <PageState variant="loading" message={t('libraryFolders.loading')} />}
    {library.status === 'error' && <>
      <PageState variant="error" message={t('libraryFolders.loadError')} />
      <Button variant="secondary" type="button" onClick={() => void library.reload()}>{t('libraryFolders.retry')}</Button>
    </>}
    {library.stale && <p role="status">{t('admin.checklists.folders.staleFolder')}</p>}
    {library.data && <>
      <FolderBreadcrumbs folders={folderPath(folders, library.id)} label={t('admin.checklists.folders.crumbs')} rootLabel={rootLabel} onSelect={library.select} />
      <nav className="assessment-folder-tree" aria-label={t(`libraryFolders.${scope}.tree`)}>
        <button className="checklist-library__open" type="button" aria-current={library.id === null ? 'page' : undefined}
          onClick={() => library.select(null)} {...drag.drop(null, drop)}>{rootLabel} ({library.data.rootItemCount})</button>
        <FolderTreeRows folders={folders} expanded={library.expanded} render={({ folder, level, hasChildren }) => {
          const expanded = library.expanded.has(folder.id);
          return <div className="assessment-folder-tree__row" style={{ paddingInlineStart: `${(level - 1) * 12}px` }}>
            {hasChildren && <button className="ds-button ds-button--secondary ds-button--sm" aria-expanded={expanded}
              aria-label={t(expanded ? 'libraryFolders.collapse' : 'libraryFolders.expand', { name: folder.name })}
              type="button" onClick={() => library.toggle(folder.id)}><span aria-hidden="true">{expanded ? '▾' : '▸'}</span></button>}
            <button className="checklist-library__open checklist-library__folder" type="button"
              aria-current={folder.id === library.id ? 'page' : undefined} onClick={() => library.select(folder.id)}
              {...drag.drop(folder.id, drop)}>
              <FolderGlyph color={folder.color} /><span>{folder.name} ({folder.totalItemCount})</span>
            </button>
          </div>;
        }} />
      </nav>
    </>}
    {error && <p role="alert">{error}</p>}
    {report && <div role="status" className="ui-state admin-inline-banner">
      <p>{t('admin.checklists.bulk.result', { done: report.done, skipped: report.skipped })}</p>
      {report.details.length > 0 && <ul>{report.details.map((line) => <li key={line.key}>{line.text}</li>)}</ul>}
      <button type="button" className="admin-inline-banner__close" aria-label={t('admin.checklists.close', 'Close')} onClick={() => setReport(null)}>×</button>
    </div>}
    {toolbar}
    <DataTable label={label} columns={tableColumns} rows={rows} keyExtractor={rowKey}
      emptyMessage={emptyMessage}
      responsiveDetails={{
        label: t('courses.details'),
        expandLabel: (row) => `${t('courses.details')}: ${rowTitle(row)}`,
        collapseLabel: (row) => `${t('courses.details')}: ${rowTitle(row)}`,
      }}
      rowProps={(row) => {
        if (!library.data || busy) return {};
        const key = rowKey(row);
        const trigger = {
          ...menu.triggerProps({ key }, () => { if (!selection.has(key)) setSelection(new Set([key])); }),
          tabIndex: 0,
          'data-row-key': key,
        };
        if (row.kind === 'folder') return { ...trigger, ...drag.drop(row.item.id, drop) };
        return { ...trigger, draggable: true, onDragStart: (event) => drag.start(event, row.item.id) };
      }}
      selection={library.data ? {
        selectedKeys: selection,
        onChange: setSelection,
        selectedLabel: (count) => t('common.selectedCount', { count }),
        selectAllLabel: t(`libraryFolders.${scope}.selectAll`),
        rowLabel: (row) => row.kind === 'folder' ? t('admin.checklists.bulk.selectFolderRow', { name: row.item.name })
          : t(`libraryFolders.${scope}.selectItem`, { title: itemTitle(row.item) }),
      } : undefined}
      batchActions={library.data ? (selected) => <>
        <FolderBulkMove busy={busy} onClick={() => setMove(selected)} t={t} />
        {selected.every((row) => row.kind === 'folder') && <FolderBulkDelete busy={busy} onClick={() => void previewDelete(selected)} t={t} />}
      </> : undefined}
    />
    {footer}
    <ContextMenu label={menuContent.label} onClose={menu.close} state={menu.state}>{menuContent.items}</ContextMenu>

    <FolderDialog target={edit} onClose={() => setEdit(null)} colors rootLabel={rootLabel} t={t}
      onSubmit={async ({ name, color }) => {
        if (!edit) return;
        try {
          await saveLibraryFolder(scope, edit.kind === 'edit' ? edit.folder.id : null, {
            name, color, ...(edit.kind === 'create' ? { parentId: edit.parent?.id ?? null } : {}),
          });
          await library.reload();
          setEdit(null);
        } catch (failure) { throw new Error(actionError(failure), { cause: failure }); }
      }} />
    <MoveToFolderDialog open={move !== null} count={move?.length ?? 0}
      title={t('admin.checklists.folders.moveOpen')} folders={folders}
      currentFolderId={moveParents.every((id) => id === moveParents[0]) ? moveParents[0] ?? null : null}
      excludeFolderIds={moveFolders} rootLabel={rootLabel} busy={busy}
      onMove={(parentId) => { if (move) void run(move, { action: 'move', parentId }); }} onClose={() => { if (!busy) setMove(null); }} t={t} />
    <ConfirmDialog open={deletion !== null} title={t('admin.checklists.folders.deleteTitle')}
      message={deletion?.message ?? ''} danger busy={busy}
      confirmLabel={t('admin.checklists.folders.delete')} cancelLabel={t('admin.checklists.cancel')}
      onConfirm={() => { if (deletion) void run(deletion.rows, { action: 'delete' }); }} onCancel={() => { if (!busy) setDeletion(null); }} />
  </div>;
}
