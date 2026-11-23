import { useImperativeHandle, useMemo, useState, type ReactNode, type Ref } from 'react';
import type { TFunction } from 'i18next';

import { bulkAssessmentFolders, getAssessmentFolderImpact, saveAssessmentFolder, type AssessmentFolder, type FolderBulkKind, type FolderBulkOperation } from '../../shared/api/assessmentFolders.js';
import { ApiClientError } from '../../shared/apiClient.js';
import { Button, ConfirmDialog, DataTable, Menu, PageState, Pagination, type Column } from '../../shared/ui.js';
import { FolderDialog, MoveToFolderDialog, type FolderDialogTarget } from '../../shared/folders/FolderDialogs.js';
import { FolderBulkDelete, FolderBulkMove } from '../../shared/folders/FolderBulkActions.js';
import { FolderGlyph } from '../../shared/folders/FolderTree.js';
import { canAddSubfolder, folderAndDescendantIds, folderPath, folderPathLabel, childrenByParent } from '../../shared/folders/folderTree.js';
import { AssessmentFolderNavigation, assessmentFolderDrop, startAssessmentDrag } from './AssessmentFolderNavigation.js';
import type { AssessmentListRow, useAssessmentList } from './useAssessmentList.js';
import type { useAssessmentFolders } from './useAssessmentFolders.js';

type Row = { kind: 'assessment'; item: AssessmentListRow } | { kind: 'folder'; item: AssessmentFolder };
const rowKey = (row: Row) => `${row.kind}:${row.item.id}`;
const rowTitle = (row: Row) => row.kind === 'folder' ? row.item.name : row.item.title;

/** What the page header can ask of the library: the "+ Create → Folder" item opens the folder dialog owned here. */
export type AssessmentLibraryActions = { createFolder: () => void };

export function AssessmentLibrary({ actionsRef, list, columns, library, renderActions, t }: {
  actionsRef?: Ref<AssessmentLibraryActions>;
  list: ReturnType<typeof useAssessmentList>;
  columns: Column<AssessmentListRow>[];
  renderActions: (assessment: AssessmentListRow, move?: () => void) => ReactNode;
  library: ReturnType<typeof useAssessmentFolders>;
  t: TFunction;
}) {
  const [selection, setSelection] = useState<{ scope: string; keys: Set<string> } | null>(null);
  const [edit, setEdit] = useState<FolderDialogTarget<AssessmentFolder> | null>(null);
  const [move, setMove] = useState<Row[] | null>(null);
  const [deletion, setDeletion] = useState<{ rows: Row[]; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ done: number; skipped: number; details: { key: string; text: string }[] } | null>(null);

  const folders = useMemo(() => library.data?.folders ?? [], [library.data]);
  const active = folders.find((folder) => folder.id === library.id) ?? null;
  const assessments = list.page.items;
  useImperativeHandle(actionsRef, () => ({
    createFolder: () => { if (library.data && !busy && canAddSubfolder(folders, library.id)) setEdit({ kind: 'create', parent: active }); },
  }), [library.data, busy, folders, library.id, active]);
  const showFolders = !list.filtering && list.folder !== 'all' && list.page.page === 1;
  const rows: Row[] = [
    ...(showFolders ? (childrenByParent(folders).get(library.id) ?? []).map((item): Row => ({ kind: 'folder', item })) : []),
    ...assessments.map((item): Row => ({ kind: 'assessment', item })),
  ];
  const scope = list.key;
  const selectedKeys = selection?.scope === scope ? selection.keys : new Set<string>();
  const moveFolders = move?.flatMap((row) => row.kind === 'folder' ? [row.item.id] : []) ?? [];
  const commonMoveParent = move?.map((row) => row.kind === 'folder' ? row.item.parentId : row.item.folderId ?? null) ?? [];

  function actionError(failure: unknown) {
    if (failure instanceof ApiClientError) {
      if (failure.status === 409) return t('admin.checklists.folders.errorDuplicate');
      if (failure.status === 404) return t('admin.checklists.folders.errorGone');
      if (failure.status === 403) return t('admin.assessmentBuilder.folders.forbidden');
      if (failure.status === 400 && /nested/i.test(failure.message)) return t('admin.checklists.folders.errorDepth');
    }
    return t('admin.checklists.folders.errorGeneric');
  }

  async function run(rows: Row[], operation: FolderBulkOperation) {
    if (busy || rows.length === 0) return;
    setBusy(true);
    setError(null);
    setReport(null);
    const next = { done: 0, skipped: 0, details: [] as { key: string; text: string }[] };
    const deleted = new Set<string>();
    try {
      // The endpoint accepts up to 100 rows per kind per request.
      for (const kind of ['folder', 'assessment'] satisfies FolderBulkKind[]) {
        const targets = rows.filter((row) => row.kind === kind);
        for (let offset = 0; offset < targets.length; offset += 100) {
          const batch = targets.slice(offset, offset + 100);
          const result = await bulkAssessmentFolders(kind, batch.map((row) => row.item.id), operation);
          const byId = new Map(batch.map((row) => [row.item.id, row]));
          next.done += result.done;
          next.skipped += result.skipped;
          for (const entry of result.results) {
            if (entry.result === 'done') {
              if (operation.action === 'delete' && kind === 'folder') {
                folderAndDescendantIds(folders, entry.id).forEach((id) => deleted.add(id));
              }
              continue;
            }
            const key = ['forbidden', 'longread_exercise', 'attempt_in_progress'].includes(entry.reason)
              ? `admin.assessmentBuilder.folders.reasons.${entry.reason}` : `admin.checklists.bulk.reason.${entry.reason}`;
            const row = byId.get(entry.id);
            next.details.push({ key: `${kind}:${entry.id}`, text: `${row ? rowTitle(row) : entry.id}: ${t(key)}` });
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
      setSelection(null);
      setMove(null);
      setDeletion(null);
      try {
        if (next.done || !next.skipped) list.reload();
        await library.reload();
      }
      catch (failure) { setError(actionError(failure)); }
      setBusy(false);
    }
  }

  async function previewDelete(rows: Row[]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ids = rows.flatMap((row) => row.kind === 'folder' ? [row.item.id] : []);
      const chosen = new Set(ids);
      const top = ids.filter((id) => !folderPath(folders, id).slice(0, -1).some(({ id: ancestor }) => chosen.has(ancestor)));
      const impacts = await Promise.all(top.map(getAssessmentFolderImpact));
      const selectedTests = new Set(rows.filter((row) => row.kind === 'assessment').map((row) => row.item.id));
      const moved = impacts.flatMap((impact) => impact.movedToRoot).filter(({ id }) => !selectedTests.has(id));
      const titles = moved.slice(0, 10).map(({ title }) => title).join(', ');
      const names = moved.length > 10 ? `${titles} ${t('admin.checklists.bulk.andMore', { count: moved.length - 10 })}` : titles;
      const messages = [
        ids.length > 0 && t('admin.assessmentBuilder.folders.deleteFolders', { count: impacts.reduce((sum, item) => sum + item.folders, 0) }),
        moved.length > 0 && t('admin.assessmentBuilder.folders.unfile', { count: moved.length, names }),
        selectedTests.size > 0 && t('admin.assessmentBuilder.folders.deleteTests', { count: selectedTests.size }),
      ];
      setDeletion({ rows, message: messages.filter(Boolean).join(' ') });
    } catch (failure) { setError(actionError(failure)); }
    finally { setBusy(false); }
  }

  function drop(id: string, parentId: string | null) {
    const assessment = assessments.find((item) => item.id === id && !item.isLongreadExercise);
    if (assessment && (assessment.folderId ?? null) !== parentId) void run([{ kind: 'assessment', item: assessment }], { action: 'move', parentId });
  }

  const tableColumns = columns.map((column): Column<Row> => ({
    ...column,
    render: (row) => {
      if (row.kind === 'assessment') {
        if (column.key === 'title') return <>
          {column.render(row.item)}
          {row.item.isLongreadExercise && <div>{t('admin.assessmentBuilder.folders.longread')}</div>}
          {list.folder === 'all' && row.item.folderId && <div>{folderPathLabel(folders, row.item.folderId)}</div>}
        </>;
        if (column.key === 'actions') return renderActions(row.item,
          library.data && !busy && !row.item.isLongreadExercise ? () => setMove([row]) : undefined);
        return column.render(row.item);
      }

      const folder = row.item;
      if (column.key === 'title') return <>
        <span className="checklist-library__folder">
          <FolderGlyph color={folder.color} />
          <button className="checklist-library__open" type="button" onClick={() => library.select(folder.id)}
            aria-label={t('admin.checklists.folders.openFolder', { name: folder.name })}>{folder.name}</button>
        </span>
        <div className="admin-form__hint">{t('admin.assessmentBuilder.folders.contents', { folders: folder.childFolderCount, tests: folder.assessmentCount })}</div>
      </>;
      if (column.key === 'actions') return <Menu align="end" buttonClassName="ds-button ds-button--secondary ds-button--sm"
        label={<><span aria-hidden="true">⋮</span><span className="ui-visually-hidden">{t('admin.checklists.folders.actions', { name: folder.name })}</span></>}>
        <button type="button" role="menuitem" onClick={() => setEdit({ kind: 'edit', folder })}>{t('admin.assessmentBuilder.folders.settings')}</button>
        <button type="button" role="menuitem" disabled={!canAddSubfolder(folders, folder.id)} onClick={() => setEdit({ kind: 'create', parent: folder })}>{t('admin.checklists.contextMenu.newInside')}</button>
        <button type="button" role="menuitem" onClick={() => setMove([row])}>{t('admin.checklists.folders.moveOpen')}</button>
        <button type="button" role="menuitem" onClick={() => void previewDelete([row])}>{t('admin.checklists.folders.delete')}</button>
      </Menu>;
      return null;
    },
  }));

  return <div className="checklist-library">
    {library.status === 'loading' && <PageState variant="loading" message={t('admin.assessmentBuilder.folders.loading')} />}
    {library.status === 'forbidden' && <PageState variant="error" message={t('admin.assessmentBuilder.folders.forbidden')} />}
    {library.status === 'error' && <>
      <PageState variant="error" message={t('admin.assessmentBuilder.folders.loadError')} />
      <Button variant="secondary" type="button" onClick={() => void library.reload()}>{t('admin.assessmentBuilder.folders.retry')}</Button>
    </>}
    {library.stale && <p role="status">{t('admin.checklists.folders.staleFolder')}</p>}
    <AssessmentFolderNavigation library={library} move={drop} t={t} />
    {error && <p role="alert">{error}</p>}
    {report && <div role="status" className="ui-state admin-inline-banner">
      <p>{t('admin.checklists.bulk.result', { done: report.done, skipped: report.skipped })}</p>
      {report.details.length > 0 && <ul>{report.details.map((line) => <li key={line.key}>{line.text}</li>)}</ul>}
      <button type="button" className="admin-inline-banner__close" aria-label={t('admin.checklists.close', 'Close')} onClick={() => setReport(null)}>×</button>
    </div>}

    {list.loading && <PageState variant="loading" message={t('admin.assessmentBuilder.loading')} />}
    {list.error && <>
      <PageState variant="error" message={t('admin.assessmentBuilder.loadError')} />
      <Button type="button" variant="secondary" onClick={list.reload}>{t('admin.assessmentBuilder.folders.retry')}</Button>
    </>}
    <DataTable label={t('admin.assessmentBuilder.title')} columns={tableColumns} rows={rows} keyExtractor={rowKey}
      sort={list.tableSort}
      onSortChange={({ key, direction }) => list.set({ sort: key, direction: direction === 'ascending' ? 'asc' : 'desc' })}
      emptyMessage={list.loading || list.error ? '' : list.filtering ? t('admin.checklists.folders.notFound') : t('admin.assessmentBuilder.folders.empty')}
      responsiveDetails={{
        label: t('courses.details'),
        expandLabel: (row) => `${t('courses.details')}: ${rowTitle(row)}`,
        collapseLabel: (row) => `${t('courses.details')}: ${rowTitle(row)}`,
      }}
      rowProps={(row) => {
        if (!library.data || busy) return {};
        if (row.kind === 'folder') return assessmentFolderDrop(row.item.id, drop);
        return row.item.isLongreadExercise ? {} : { draggable: true, onDragStart: (event) => startAssessmentDrag(event, row.item.id) };
      }}
      selection={library.data ? {
        selectedKeys,
        onChange: (keys) => setSelection({ scope, keys }),
        selectedLabel: (count) => t('common.selectedCount', { count }),
        selectAllLabel: t('admin.assessmentBuilder.folders.selectAll'),
        rowLabel: (row) => row.kind === 'folder' ? t('admin.checklists.bulk.selectFolderRow', { name: row.item.name })
          : t('admin.assessmentBuilder.folders.selectTest', { title: row.item.title }),
      } : undefined}
      batchActions={(selected) => <>
        <FolderBulkMove busy={busy || !selected.some((row) => row.kind === 'folder' || !row.item.isLongreadExercise)} onClick={() => setMove(selected)} t={t} />
        <FolderBulkDelete busy={busy} onClick={() => void previewDelete(selected)} t={t} />
      </>}
    />

    <Pagination page={list.page.page} pageSize={list.page.pageSize} total={list.page.total}
      onPage={(page) => list.set({ page: page === 1 ? '' : String(page) })}
      label={t('admin.assessmentBuilder.list.pagination')}
      prevLabel={t('admin.assessmentBuilder.list.previous')} nextLabel={t('admin.assessmentBuilder.list.next')} />

    <FolderDialog target={edit} onClose={() => setEdit(null)} colors rootLabel={library.rootLabel} t={t}
      onSubmit={async ({ name, color }) => {
        if (!edit) return;
        try {
          await saveAssessmentFolder(edit.kind === 'edit' ? edit.folder.id : null, {
            name, color, ...(edit.kind === 'create' ? { parentId: edit.parent?.id ?? null } : {}),
          });
          await library.reload();
          setEdit(null);
        } catch (failure) { throw new Error(actionError(failure), { cause: failure }); }
      }} />
    <MoveToFolderDialog open={move !== null} count={move?.length ?? 0}
      title={t('admin.checklists.folders.moveOpen')} folders={folders}
      currentFolderId={commonMoveParent.every((id) => id === commonMoveParent[0]) ? commonMoveParent[0] ?? null : null}
      excludeFolderIds={moveFolders} rootLabel={library.rootLabel} busy={busy}
      onMove={(parentId) => { if (move) void run(move, { action: 'move', parentId }); }} onClose={() => { if (!busy) setMove(null); }} t={t} />
    <ConfirmDialog open={deletion !== null} title={t(deletion?.rows.every((row) => row.kind === 'folder') ? 'admin.checklists.folders.deleteTitle' : 'admin.checklists.folders.delete')}
      message={deletion?.message ?? ''} danger busy={busy}
      confirmLabel={t('admin.checklists.folders.delete')} cancelLabel={t('admin.checklists.cancel')}
      onConfirm={() => { if (deletion) void run(deletion.rows, { action: 'delete' }); }} onCancel={() => { if (!busy) setDeletion(null); }} />
  </div>;
}
