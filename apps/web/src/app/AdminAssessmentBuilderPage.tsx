import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { AdminPageHeader, AdminPageLayout, ConfirmDialog, type AdminNavItem } from '../shared/adminPage.js';
import { Badge, Button, Menu, PageState, SearchInput, Toolbar, type Column } from '../shared/ui.js';
import { formatDate } from '../shared/formatDate.js';
import { folderRows } from '../shared/folders/folderTree.js';
import { ASSESSMENT_STATUSES, type Assessment, type AssessmentStatus } from './assessment-builder/model.js';
import { StandaloneAssessmentDialog } from './assessment-builder/StandaloneAssessmentDialog.js';
import { AssessmentLibrary, type AssessmentLibraryActions } from './assessment-builder/AssessmentLibrary.js';
import { FolderCreateMenu } from '../shared/folders/FolderCreateMenu.js';
import { canAddSubfolder } from '../shared/folders/folderTree.js';
import { useAssessmentFolders } from './assessment-builder/useAssessmentFolders.js';
import { useAssessmentBuilder } from './assessment-builder/useAssessmentBuilder.js';

import { useAssessmentList, type AssessmentListRow } from './assessment-builder/useAssessmentList.js';
import { AssessmentListResults } from './assessment-builder/AssessmentListResults.js';

export function AdminAssessmentBuilderPage() {
  const { t } = useTranslation();
  const builder = useAssessmentBuilder(t);
  const library = useAssessmentFolders(t);
  const list = useAssessmentList(library.stale);
  const [resultsAssessment, setResultsAssessment] = useState<Assessment | null>(null);
  const [managedAssessment, setManagedAssessment] = useState<Assessment | null>(null);
  const libraryActions = useRef<AssessmentLibraryActions | null>(null);
  const standaloneDialogRef = useRef<HTMLDialogElement>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assessment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const statusLabels: Record<AssessmentStatus, string> = {
    draft: t('admin.assessmentBuilder.status.draft', 'Draft'),
    published: t('admin.assessmentBuilder.status.published', 'Published'),
    archived: t('admin.assessmentBuilder.status.archived', 'Archived'),
  };

  async function updateStatus(id: string, status: string) {
    setStatusError(null);
    try {
      await apiRequest(`/assessments/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      list.reload();
    } catch (error) {
      setStatusError(error instanceof ApiClientError ? error.message : t('admin.assessmentBuilder.statusError', 'Unable to update status.'));
      list.reload();
    }
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/assessments/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
      list.reload();
      void library.reload();
      setDeleteTarget(null);
    } catch (error) {
      setStatusError(error instanceof ApiClientError ? error.message : t('admin.assessmentBuilder.deleteError', 'Unable to delete assessment.'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function copyAssessment(assessment: Assessment) {
    setStatusError(null);
    try {
      await apiRequest(`/assessments/${encodeURIComponent(assessment.id)}/copy`, { method: 'POST' });
      list.reload();
      void library.reload();
    } catch {
      setStatusError(t('admin.assessmentBuilder.list.copyError'));
    }
  }

  /** PR 583: the own course as it is, then the other courses and longreads; a test with none is standalone. */
  function usedIn(a: AssessmentListRow) {
    const parts = [a.courseTitle, ...(a.places ?? []).map((place) =>
      t(place.kind === 'longread' ? 'admin.assessmentBuilder.list.placeLongread' : 'admin.assessmentBuilder.list.placeCourse', { title: place.title }))].filter(Boolean);
    return parts.length ? parts.join(' · ') : t('admin.assessmentBuilder.list.standalone');
  }

  function openCreateDialog() {
    const params = new URLSearchParams({ list: window.location.search.slice(1) });
    window.location.assign(`/admin/assessments/new?${params}`);
  }

  function openEditor(assessment: Assessment, tab = 'questions') {
    const params = new URLSearchParams({ tab, list: window.location.search.slice(1) });
    window.location.assign(`/admin/assessments/${encodeURIComponent(assessment.id)}/edit?${params}`);
  }

  function renderActions(assessment: AssessmentListRow, move?: () => void) {
    return <div className="td-actions">
      {assessment.status !== 'published' && <Button size="sm" variant="primary" type="button"
        disabled={!assessment.questionsCount}
        title={!assessment.questionsCount ? t('admin.assessmentBuilder.publishNoQuestions') : undefined}
        onClick={() => openEditor(assessment)}>{t('admin.assessmentBuilder.publish')}</Button>}
      {assessment.courseId === null && assessment.status === 'published' && <Button size="sm" variant="secondary" type="button"
        onClick={() => { setManagedAssessment(assessment); standaloneDialogRef.current?.showModal(); }}>{t('admin.assessmentBuilder.list.shareLink')}</Button>}
      {assessment.status !== 'archived' && <Button size="sm" variant="secondary" type="button"
        onClick={() => void updateStatus(assessment.id, 'archived')}>{t('admin.checklists.action.archive')}</Button>}
      <Menu align="end" buttonClassName="ds-button ds-button--secondary ds-button--sm"
        label={<><span aria-hidden="true">⋮</span><span className="ui-visually-hidden">{t('admin.checklists.contextMenu.rowLabel', { name: assessment.title })}</span></>}>
        <button type="button" role="menuitem" onClick={() => openEditor(assessment)}>{t('admin.assessmentBuilder.edit')}</button>
        <button type="button" role="menuitem" onClick={() => openEditor(assessment, 'questions')}>{t('admin.assessmentBuilder.questions')}</button>
        <button type="button" role="menuitem" onClick={() => void copyAssessment(assessment)}>{t('admin.checklists.copy')}</button>
        {move && <button type="button" role="menuitem" onClick={move}>{t('admin.checklists.folders.moveOpen')}</button>}
        <button type="button" role="menuitem" onClick={() => openEditor(assessment, 'preview')}>{t('admin.assessmentBuilder.preview')}</button>
        <button type="button" role="menuitem" onClick={() => setResultsAssessment(assessment)}>{t('admin.results.assessmentResultsTitle')}</button>
        {assessment.courseId === null && assessment.status === 'published' && <button type="button" role="menuitem" onClick={() => {
          setManagedAssessment(assessment);
          standaloneDialogRef.current?.showModal();
        }}>{t('assessments.standalone.manage')}</button>}
        <button type="button" role="menuitem" onClick={() => setDeleteTarget(assessment)}>{t('admin.assessmentBuilder.delete')}</button>
      </Menu>
    </div>;
  }

  if (builder.loadState.status === 'loading') return <main className="admin-state"><PageState message={t('admin.assessmentBuilder.loading', 'Loading assessment builder...')} variant="loading"/></main>;
  if (builder.loadState.status === 'error') return <main className="admin-state"><PageState title={t('admin.assessmentBuilder.title', 'Assessment builder')} message={builder.loadState.message} variant="error"/></main>;
  const data = builder.loadState;
  const navItems: AdminNavItem[] = [{ label: t('admin.courseBuilder.title', 'Course builder'), href: '/admin/courses' }, { label: t('admin.lessons.title', 'Lesson editor'), href: '/admin/lessons' }, { label: t('admin.materials.title', 'Materials'), href: '/admin/materials' }, { label: t('admin.assessmentBuilder.title', 'Assessment builder'), href: '/admin/assessments', isCurrent: true }];
  return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={navItems}>
    <AdminPageHeader
      eyebrow={t('admin.assessmentBuilder.eyebrow', 'Knowledge control')}
      title={t('admin.assessmentBuilder.title', 'Assessment builder')}
      subtitle={t('admin.assessmentBuilder.subtitle', 'Create and manage assessments for courses and lessons.')}
      action={
        <FolderCreateMenu
          canCreateFolder={Boolean(library.data) && canAddSubfolder(library.data?.folders ?? [], library.id)}
          itemLabel={t('admin.assessmentBuilder.folders.createTest', 'Assessment')}
          onCreateFolder={() => libraryActions.current?.createFolder()}
          onCreateItem={openCreateDialog}
          t={t}
        />
      }
    />

    <Link to="/admin/assessments/analytics">{t('assessmentAnalytics.title')}</Link>

    {statusError && (
      <div className="ui-state ui-state--error admin-inline-banner" role="alert">
        <p>{statusError}</p>
        <button type="button" className="admin-inline-banner__close" aria-label={t('admin.assessmentBuilder.close', 'Close')} onClick={() => setStatusError(null)}>×</button>
      </div>
    )}

    <Toolbar
      left={<SearchInput value={list.search} onChange={(search) => list.set({ search }, true)}
        placeholder={t('admin.assessmentBuilder.searchPlaceholder')} />}
      right={<>
        <div><select className="admin-status-select" aria-label={t('admin.assessmentBuilder.allStatuses')}
          value={list.status} onChange={(event) => list.set({ status: event.target.value })}>
          <option value="">{t('admin.assessmentBuilder.allStatuses')}</option>
          {ASSESSMENT_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select></div>
        <div><select className="admin-status-select" aria-label={t('admin.assessmentBuilder.list.course')}
          value={list.course} onChange={(event) => list.set({ course: event.target.value })}>
          <option value="">{t('admin.assessmentBuilder.list.allCourses')}</option>
          <option value="standalone">{t('admin.assessmentBuilder.list.standalone')}</option>
          {data.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
        </select></div>
        <div><select className="admin-status-select" aria-label={t('admin.checklists.col.folder')}
          value={list.folder} onChange={(event) => list.set({ folder: event.target.value })}>
          <option value="all">{t('admin.assessmentBuilder.list.allFolders')}</option>
          <option value="root">{t('admin.assessmentBuilder.list.root')}</option>
          {folderRows(library.data?.folders ?? []).map(({ folder, level }) => <option key={folder.id} value={folder.id}>
            {'– '.repeat(level - 1)}{folder.name}
          </option>)}
        </select></div>
        <div><select className="admin-status-select" aria-label={t('admin.assessmentBuilder.col.attempts')}
          value={list.attempts} onChange={(event) => list.set({ attempts: event.target.value })}>
          <option value="">{t('admin.assessmentBuilder.list.anyAttempts')}</option>
          <option value="with">{t('admin.assessmentBuilder.list.withAttempts')}</option>
          <option value="without">{t('admin.assessmentBuilder.list.withoutAttempts')}</option>
        </select></div>
        <label className="admin-checkbox-field"><input type="checkbox" checked={list.mine}
          onChange={(event) => list.set({ mine: event.target.checked ? 'true' : '' })} />
          {t('admin.assessmentBuilder.list.mine')}</label>
      </>}
    />

    <AssessmentLibrary actionsRef={libraryActions} list={list} library={library} renderActions={renderActions} t={t}
      columns={[
        { key: 'title', label: t('admin.assessmentBuilder.col.title'), priority: 'primary', sortable: true, render: (a) => a.title },
        { key: 'course', label: t('admin.assessmentBuilder.list.usedIn'), priority: 'secondary', sortable: true, render: (a) => usedIn(a) },
        { key: 'status', label: t('admin.assessmentBuilder.col.status'), priority: 'primary', sortable: true, render: (a) => <div className="td-actions">
          <Badge variant={a.status === 'published' ? 'published' : a.status === 'draft' ? 'draft' : 'neutral'}>
            {statusLabels[a.status as AssessmentStatus]}
          </Badge>
          {a.hasUnpublishedChanges && <Badge variant="draft">{t('admin.assessmentBuilder.editor.unpublished')}</Badge>}
        </div> },
        { key: 'questions', label: t('admin.assessmentBuilder.col.questions'), priority: 'secondary', sortable: true, render: (a) => a.questionsCount },
        { key: 'attempts', label: t('admin.assessmentBuilder.col.attempts'), priority: 'secondary', sortable: true, render: (a) => a.attemptsCount },
        { key: 'passRate', label: t('admin.assessmentBuilder.list.passRate'), priority: 'secondary', sortable: true, render: (a) => a.passRate == null ? '—' : `${a.passRate}%` },
        { key: 'lastAttemptAt', label: t('admin.assessmentBuilder.list.lastAttempt'), priority: 'secondary', sortable: true, render: (a) => a.lastAttemptAt ? formatDate(a.lastAttemptAt) : '—' },
        { key: 'actions', label: '', priority: 'secondary', render: () => null },
      ] satisfies Column<AssessmentListRow>[]}
    />

    {resultsAssessment && <AssessmentListResults key={resultsAssessment.id} assessment={resultsAssessment}
      close={() => setResultsAssessment(null)} t={t} />}

    <dialog ref={standaloneDialogRef} className="admin-dialog" onClose={() => setManagedAssessment(null)}>
      {managedAssessment && <StandaloneAssessmentDialog assessment={managedAssessment} dialog={standaloneDialogRef} />}
    </dialog>
    <ConfirmDialog
      open={deleteTarget !== null}
      title={t('admin.assessmentBuilder.deleteTitle', 'Delete assessment')}
      message={t('admin.assessmentBuilder.deleteConfirm', 'Delete "{{title}}"? This action cannot be undone.', { title: deleteTarget?.title ?? '' })}
      confirmLabel={deleting ? t('admin.assessmentBuilder.deleting', 'Deleting...') : t('admin.assessmentBuilder.delete', 'Delete')}
      cancelLabel={t('admin.assessmentBuilder.cancel', 'Cancel')}
      variant="danger"
      onConfirm={() => void confirmDelete()}
      onCancel={() => setDeleteTarget(null)}
    />
  </AdminPageLayout>;
}
