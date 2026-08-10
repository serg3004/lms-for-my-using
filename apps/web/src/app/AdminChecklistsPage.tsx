import { useCallback, useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ApiClientError, getCurrentUser } from '../shared/apiClient.js';
import type { CurrentUser } from '../shared/apiClient.js';
import { AdminPageHeader, AdminPageLayout, ConfirmDialog, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { AdminStatusSelect } from '../shared/AdminStatusSelect.js';
import { Badge, Button, DataTable, EmptyState, PageState, SearchInput, Toolbar, type Column } from '../shared/ui.js';
import {
  assignChecklist,
  createChecklist,
  createChecklistItem,
  deleteChecklist,
  deleteChecklistItem,
  listChecklists,
  listInstancesForChecklist,
  updateChecklist,
  updateChecklistItem,
} from '../shared/api/checklists.js';
import type {
  ChecklistInstanceSummary,
  ChecklistItemSummary,
  ChecklistScaleLevel,
  ChecklistScoringMode,
  ChecklistStatus,
  ChecklistSummary,
} from '../shared/api/types.js';

const CHECKLIST_STATUSES: ChecklistStatus[] = ['draft', 'published', 'archived'];
const SCORING_MODES: ChecklistScoringMode[] = ['sum_points', 'all_required', 'scale'];

const DEFAULT_SCALE: ChecklistScaleLevel[] = [
  { level: 1, label: 'Очень плохо', points: 0 },
  { level: 2, label: 'Плохо', points: 25 },
  { level: 3, label: 'Хорошо', points: 50 },
  { level: 4, label: 'Очень хорошо', points: 75 },
  { level: 5, label: 'Отлично', points: 100 },
];

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; checklists: ChecklistSummary[]; currentUser: CurrentUser }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'error'; message: string };

export function AdminChecklistsPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ChecklistStatus>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChecklistSummary | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const statusLabels: Record<ChecklistStatus, string> = {
    draft: t('admin.checklists.status.draft', 'Draft'),
    published: t('admin.checklists.status.published', 'Published'),
    archived: t('admin.checklists.status.archived', 'Archived'),
  };

  const scoringModeLabels: Record<ChecklistScoringMode, string> = {
    sum_points: t('admin.checklists.scoring.sumPoints', 'Sum of points'),
    all_required: t('admin.checklists.scoring.allRequired', 'All items required'),
    scale: t('admin.checklists.scoring.scale', 'Custom scale'),
  };

  const load = useCallback(async () => {
    setLoadState({ status: 'loading' });
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        setLoadState({ status: 'unauthenticated', message: t('admin.checklists.sessionExpired', 'Your session has expired. Please sign in again.') });
        return;
      }
      const checklists = await listChecklists();
      setLoadState({ status: 'loaded', checklists, currentUser });
    } catch (error) {
      setLoadState({ status: 'error', message: error instanceof ApiClientError ? error.message : t('admin.checklists.loadError', 'Unable to load checklists.') });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(checklist: ChecklistSummary, status: ChecklistStatus) {
    setStatusError(null);
    try {
      await updateChecklist(checklist.id, { status });
      await load();
    } catch (error) {
      setStatusError(error instanceof ApiClientError ? error.message : t('admin.checklists.statusError', 'Unable to update status.'));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteChecklist(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (error) {
      setStatusError(error instanceof ApiClientError ? error.message : t('admin.checklists.deleteError', 'Unable to delete checklist.'));
      setDeleteTarget(null);
    }
  }

  if (loadState.status === 'loading' || loadState.status === 'idle') {
    return <main className="admin-state"><PageState message={t('admin.checklists.loading', 'Loading checklists...')} variant="loading" /></main>;
  }
  if (loadState.status === 'unauthenticated' || loadState.status === 'error') {
    return <main className="admin-state"><PageState title={t('admin.checklists.title', 'Checklists')} message={loadState.message} variant="error" /></main>;
  }

  const navItems: AdminNavItem[] = [
    { label: t('admin.courseBuilder.title', 'Course builder'), href: '/admin/courses' },
    { label: t('admin.assessmentBuilder.title', 'Assessment builder'), href: '/admin/assessments' },
    { label: t('admin.checklists.title', 'Checklists'), href: '/admin/checklists', isCurrent: true },
  ];

  if (selectedId) {
    const checklist = loadState.checklists.find((c) => c.id === selectedId);
    if (!checklist) {
      setSelectedId(null);
      return null;
    }
    return (
      <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={navItems} currentUser={loadState.currentUser}>
        <ChecklistBuilder
          checklist={checklist}
          statusLabels={statusLabels}
          scoringModeLabels={scoringModeLabels}
          onBack={() => setSelectedId(null)}
          onReload={load}
          t={t}
        />
      </AdminPageLayout>
    );
  }

  const filtered = loadState.checklists.filter((checklist) => {
    if (statusFilter !== 'all' && checklist.status !== statusFilter) return false;
    if (search.trim() && !checklist.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={navItems} currentUser={loadState.currentUser}>
      <AdminPageHeader
        eyebrow={t('admin.checklists.eyebrow', 'Knowledge control')}
        title={t('admin.checklists.title', 'Checklists')}
        subtitle={t('admin.checklists.subtitle', 'Configurable checklists with points or a custom scale, photo confirmation, and automatic or manual grading.')}
        action={
          <Button
            variant="primary"
            type="button"
            onClick={async () => {
              const created = await createChecklist(loadState.currentUser.organizationId, {
                title: t('admin.checklists.newChecklistTitle', 'New checklist'),
                scoringMode: 'sum_points',
                passThreshold: 80,
                requiresReview: false,
              });
              await load();
              setSelectedId(created.id);
            }}
          >
            + {t('admin.checklists.create', 'Create checklist')}
          </Button>
        }
      />

      {statusError && (
        <div className="ui-state ui-state--error admin-inline-banner" role="alert">
          <p>{statusError}</p>
          <button type="button" className="admin-inline-banner__close" aria-label={t('admin.checklists.close', 'Close')} onClick={() => setStatusError(null)}>×</button>
        </div>
      )}

      <Toolbar
        left={<SearchInput value={search} onChange={setSearch} placeholder={t('admin.checklists.searchPlaceholder', 'Find checklist')} />}
        right={
          <select className="admin-status-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ChecklistStatus)}>
            <option value="all">{t('admin.checklists.allStatuses', 'All statuses')}</option>
            {CHECKLIST_STATUSES.map((status) => (
              <option key={status} value={status}>{statusLabels[status]}</option>
            ))}
          </select>
        }
      />

      <DataTable<ChecklistSummary>
        columns={[
          { key: 'title', label: t('admin.checklists.col.title', 'Title'), render: (c) => c.title },
          { key: 'items', label: t('admin.checklists.col.items', 'Items'), render: (c) => c.items.length },
          { key: 'scoring', label: t('admin.checklists.col.scoring', 'Scoring'), render: (c) => <Badge variant="neutral">{scoringModeLabels[c.scoringMode]}</Badge> },
          { key: 'status', label: t('admin.checklists.col.status', 'Status'), render: (c) => (
            <AdminStatusSelect value={c.status} statuses={CHECKLIST_STATUSES} labels={statusLabels} onChange={(status) => void updateStatus(c, status)} />
          ) },
          { key: 'actions', label: '', render: (c) => (
            <div className="td-actions">
              <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => setSelectedId(c.id)}>{t('admin.checklists.edit', 'Edit')}</button>
              <button className="admin-btn admin-btn--sm admin-btn--danger" type="button" onClick={() => setDeleteTarget(c)}>{t('admin.checklists.delete', 'Delete')}</button>
            </div>
          ) },
        ] satisfies Column<ChecklistSummary>[]}
        rows={filtered}
        keyExtractor={(c) => c.id}
        emptyMessage={t('admin.checklists.empty', 'No checklists found.')}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('admin.checklists.deleteTitle', 'Delete checklist')}
        message={t('admin.checklists.deleteConfirm', 'Delete "{{title}}"? This action cannot be undone.', { title: deleteTarget?.title ?? '' })}
        confirmLabel={t('admin.checklists.delete', 'Delete')}
        cancelLabel={t('admin.checklists.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </AdminPageLayout>
  );
}

function ChecklistBuilder({
  checklist,
  statusLabels,
  scoringModeLabels,
  onBack,
  onReload,
  t,
}: {
  checklist: ChecklistSummary;
  statusLabels: Record<ChecklistStatus, string>;
  scoringModeLabels: Record<ChecklistScoringMode, string>;
  onBack: () => void;
  onReload: () => Promise<void>;
  t: TFunction;
}) {
  const [title, setTitle] = useState(checklist.title);
  const [description, setDescription] = useState(checklist.description ?? '');
  const [scoringMode, setScoringMode] = useState<ChecklistScoringMode>(checklist.scoringMode);
  const [passThreshold, setPassThreshold] = useState(checklist.passThreshold);
  const [requiresReview, setRequiresReview] = useState(checklist.requiresReview);
  const [scaleLevels, setScaleLevels] = useState<ChecklistScaleLevel[]>(checklist.scaleLevels ?? DEFAULT_SCALE);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [newItemText, setNewItemText] = useState('');
  const [instances, setInstances] = useState<ChecklistInstanceSummary[]>([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    listInstancesForChecklist(checklist.id).then(setInstances).catch(() => setInstances([]));
  }, [checklist.id]);

  async function saveSettings() {
    setSaveState({ status: 'saving' });
    try {
      await updateChecklist(checklist.id, {
        title,
        description: description || null,
        scoringMode,
        passThreshold,
        requiresReview,
        scaleLevels: scoringMode === 'scale' ? scaleLevels : null,
      });
      setSaveState({ status: 'idle' });
      await onReload();
    } catch (error) {
      setSaveState({ status: 'error', message: error instanceof ApiClientError ? error.message : t('admin.checklists.saveError', 'Unable to save checklist.') });
    }
  }

  async function publish() {
    try {
      await updateChecklist(checklist.id, { status: 'published' });
      await onReload();
    } catch (error) {
      setSaveState({ status: 'error', message: error instanceof ApiClientError ? error.message : t('admin.checklists.publishError', 'Unable to publish checklist.') });
    }
  }

  async function addItem() {
    if (!newItemText.trim()) return;
    await createChecklistItem(checklist.id, { text: newItemText.trim(), points: 10, isRequired: true, photoRequired: false });
    setNewItemText('');
    await onReload();
  }

  async function saveItem(item: ChecklistItemSummary, patch: Partial<ChecklistItemSummary>) {
    await updateChecklistItem(item.id, patch);
    await onReload();
  }

  async function removeItem(item: ChecklistItemSummary) {
    await deleteChecklistItem(item.id);
    await onReload();
  }

  function updateScaleLevel(index: number, patch: Partial<ChecklistScaleLevel>) {
    setScaleLevels((prev) => prev.map((level, i) => (i === index ? { ...level, ...patch } : level)));
  }

  function addScaleLevel() {
    setScaleLevels((prev) => [...prev, { level: prev.length + 1, label: '', points: 0 }]);
  }

  function removeScaleLevel(index: number) {
    setScaleLevels((prev) => prev.filter((_, i) => i !== index));
  }

  async function assign() {
    setAssignError(null);
    if (!assignUserId.trim()) return;
    try {
      await assignChecklist(checklist.id, assignUserId.trim());
      setAssignUserId('');
      const updated = await listInstancesForChecklist(checklist.id);
      setInstances(updated);
    } catch (error) {
      setAssignError(error instanceof ApiClientError ? error.message : t('admin.checklists.assignError', 'Unable to assign this checklist.'));
    }
  }

  return (
    <div className="admin-builder">
      <button type="button" className="admin-back-link" onClick={onBack}>
        ← {t('admin.checklists.backToList', 'All checklists')}
      </button>

      <AdminPageHeader
        eyebrow={t('admin.checklists.eyebrow', 'Knowledge control')}
        title={checklist.title}
        subtitle={statusLabels[checklist.status]}
        action={
          checklist.status !== 'published' ? (
            <Button
              variant="primary"
              type="button"
              disabled={checklist.items.length === 0}
              title={checklist.items.length === 0 ? t('admin.checklists.publishNoItems', 'Add at least one item before publishing.') : undefined}
              onClick={() => void publish()}
            >
              {t('admin.checklists.publish', 'Publish')}
            </Button>
          ) : undefined
        }
      />

      <div className="admin-builder__grid">
        <div className="admin-builder__column">
          <section className="admin-card">
            <FormField id="checklist-title" label={t('admin.checklists.field.title', 'Title')}>
              <input id="checklist-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormField id="checklist-description" label={t('admin.checklists.field.description', 'Description')}>
              <textarea id="checklist-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </FormField>
          </section>

          <section className="admin-card">
            <h3>{t('admin.checklists.itemsTitle', 'Checklist items')} <Badge variant="neutral">{checklist.items.length}</Badge></h3>
            <ul className="admin-checklist-items">
              {checklist.items.map((item, index) => (
                <li key={item.id} className="admin-checklist-item">
                  <span className="admin-checklist-item__index">{index + 1}</span>
                  <input
                    value={item.text}
                    onChange={(e) => void saveItem(item, { text: e.target.value })}
                    onBlur={(e) => void saveItem(item, { text: e.target.value })}
                  />
                  {scoringMode === 'sum_points' && (
                    <input
                      type="number"
                      className="admin-checklist-item__points"
                      value={item.points}
                      onChange={(e) => void saveItem(item, { points: Number(e.target.value) })}
                      aria-label={t('admin.checklists.field.points', 'Points')}
                    />
                  )}
                  <label className="admin-checklist-item__photo">
                    <input type="checkbox" checked={item.photoRequired} onChange={(e) => void saveItem(item, { photoRequired: e.target.checked })} />
                    {t('admin.checklists.field.photoRequired', 'Photo required')}
                  </label>
                  <button type="button" className="admin-btn admin-btn--sm admin-btn--danger" onClick={() => void removeItem(item)}>
                    {t('admin.checklists.delete', 'Delete')}
                  </button>
                </li>
              ))}
            </ul>
            {checklist.items.length === 0 && <EmptyState message={t('admin.checklists.noItems', 'No items yet.')} />}
            <div className="admin-checklist-add-item">
              <input
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder={t('admin.checklists.addItemPlaceholder', 'New item text')}
              />
              <Button type="button" variant="secondary" onClick={() => void addItem()}>
                + {t('admin.checklists.addItem', 'Add item')}
              </Button>
            </div>
          </section>
        </div>

        <div className="admin-builder__column">
          <section className="admin-card">
            <h3>{t('admin.checklists.scoringTitle', 'Scoring')}</h3>
            <div className="admin-seg">
              {SCORING_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={mode === scoringMode ? 'admin-seg__btn admin-seg__btn--active' : 'admin-seg__btn'}
                  onClick={() => setScoringMode(mode)}
                >
                  {scoringModeLabels[mode]}
                </button>
              ))}
            </div>

            {scoringMode === 'scale' && (
              <div className="admin-scale-levels">
                <label>{t('admin.checklists.scaleLevelsTitle', 'Scale levels')}</label>
                {scaleLevels.map((level, index) => (
                  <div key={index} className="admin-scale-level-row">
                    <span className="admin-scale-level-row__n">{level.level}</span>
                    <input
                      value={level.label}
                      onChange={(e) => updateScaleLevel(index, { label: e.target.value })}
                      placeholder={t('admin.checklists.scaleLevelLabel', 'Label')}
                    />
                    <input
                      value={level.description ?? ''}
                      onChange={(e) => updateScaleLevel(index, { description: e.target.value })}
                      placeholder={t('admin.checklists.scaleLevelDescription', 'Description (optional)')}
                    />
                    <input
                      type="number"
                      value={level.points}
                      onChange={(e) => updateScaleLevel(index, { points: Number(e.target.value) })}
                    />
                    <button type="button" className="admin-scale-level-row__remove" onClick={() => removeScaleLevel(index)} aria-label={t('admin.checklists.delete', 'Delete')}>×</button>
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={addScaleLevel}>
                  + {t('admin.checklists.addScaleLevel', 'Add level')}
                </Button>
                <p className="admin-form__hint">{t('admin.checklists.scaleLevelsHint', 'Label, description and points are freely editable — the number of levels is not limited to 5.')}</p>
              </div>
            )}

            <FormField id="checklist-threshold" label={t('admin.checklists.field.passThreshold', 'Pass threshold, %')}>
              <input
                id="checklist-threshold"
                type="number"
                min={0}
                max={100}
                value={passThreshold}
                onChange={(e) => setPassThreshold(Number(e.target.value))}
              />
            </FormField>

            <label className="admin-checkbox-field">
              <input type="checkbox" checked={requiresReview} onChange={(e) => setRequiresReview(e.target.checked)} />
              {t('admin.checklists.field.requiresReview', 'Require an instructor to confirm the result before it counts')}
            </label>
            <p className="admin-form__hint">
              {t('admin.checklists.requiresReviewHint', 'When enabled, learner submissions are computed automatically but stay pending until an instructor or manager approves each item.')}
            </p>

            {saveState.status === 'error' && <p className="learner-quiz__submit-error" role="alert">{saveState.message}</p>}

            <Button type="button" variant="primary" disabled={saveState.status === 'saving'} onClick={() => void saveSettings()}>
              {saveState.status === 'saving' ? t('admin.checklists.saving', 'Saving...') : t('admin.checklists.save', 'Save')}
            </Button>
          </section>

          <section className="admin-card">
            <h3>{t('admin.checklists.assignmentTitle', 'Assignment')}</h3>
            <FormField id="checklist-assign-user" label={t('admin.checklists.field.assignUserId', 'User ID')} hint={t('admin.checklists.assignUserHint', 'Manual assignment for now — automatic and scheduled triggers are planned next.')}>
              <input id="checklist-assign-user" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
            </FormField>
            {assignError && <p className="learner-quiz__submit-error" role="alert">{assignError}</p>}
            <Button type="button" variant="secondary" disabled={checklist.status !== 'published'} onClick={() => void assign()}>
              {t('admin.checklists.assign', 'Assign')}
            </Button>

            <h4>{t('admin.checklists.instancesTitle', 'Assignments')} <Badge variant="neutral">{instances.length}</Badge></h4>
            {instances.length === 0 ? (
              <EmptyState message={t('admin.checklists.noInstances', 'Not assigned to anyone yet.')} />
            ) : (
              <ul className="admin-checklist-instances">
                {instances.map((instance) => (
                  <li key={instance.id}>
                    <span>{instance.userId}</span>
                    <Badge variant="neutral">{t(`admin.checklists.instanceStatus.${instance.status}`, instance.status)}</Badge>
                    <span>{instance.totalScore}/{instance.maxScore} ({instance.percentage}%)</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
