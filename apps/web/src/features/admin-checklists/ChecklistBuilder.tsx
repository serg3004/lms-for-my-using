import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { ApiClientError } from '../../shared/apiClient.js';
import { AdminPageHeader, FormField } from '../../shared/adminPage.js';
import { Badge, Button, EmptyState } from '../../shared/ui.js';
import { listUsers } from '../../shared/api/users.js';
import { assignChecklist, createChecklistItem, deleteChecklistItem, listInstancesForChecklist, updateChecklist, updateChecklistItem } from '../../shared/api/checklists.js';
import type { ChecklistInstanceSummary, ChecklistItemSummary, ChecklistScaleLevel, ChecklistScoringMode, ChecklistStatus, ChecklistSummary, UserSummary } from '../../shared/api/types.js';
import { ChecklistDeadlineMeta } from '../../app/ChecklistDeadlineMeta.js';
import { localDateTimeToUtcIso } from '../../app/checklistDeadline.js';
import { ChecklistAssignmentPanel } from './ChecklistAssignmentPanel.js';
import { ChecklistItemsEditor } from './ChecklistItemsEditor.js';
import { ChecklistPreviewDialog } from './ChecklistPreviewDialog.js';
import { ChecklistSettingsForm } from './ChecklistSettingsForm.js';
import { applyItemPatch, appendScaleLevel, buildChecklistSettingsPayload, canAssignChecklist, computePreviewResult, createDefaultScale, filterAssignableUsers, formatUserName, removeItemById, removeScaleLevelAt, resolveUserName, SCORING_MODES, type PreviewAnswer, type SaveState, applyScaleLevelPatch } from './domain.js';

export function ChecklistBuilder({
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
  // Defaults are system copy and follow the locale at creation time. Existing labels are authored
  // content, so changing the UI language must never rewrite them.
  const [scaleLevels, setScaleLevels] = useState<ChecklistScaleLevel[]>(() => checklist.scaleLevels ?? createDefaultScale(t));
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  // Items live in local state so a single keystroke or checkbox click never has to wait on (and
  // get interrupted by) a server round-trip — see the "why does the page reload" bug this fixes.
  const [items, setItems] = useState<ChecklistItemSummary[]>(checklist.items);
  const [newItemText, setNewItemText] = useState('');
  const [instances, setInstances] = useState<ChecklistInstanceSummary[]>([]);
  const [orgUsers, setOrgUsers] = useState<UserSummary[]>([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignDueAt, setAssignDueAt] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, PreviewAnswer>>({});
  useEffect(() => {
    listInstancesForChecklist(checklist.id).then(setInstances).catch(() => setInstances([]));
    listUsers({ page: 1, pageSize: 200 }).then((result) => setOrgUsers(result.items)).catch(() => setOrgUsers([]));
  }, [checklist.id]);
  async function saveSettings() {
    setSaveState({ status: 'saving' });
    try {
      await updateChecklist(checklist.id, buildChecklistSettingsPayload({ title, description, scoringMode, passThreshold, requiresReview, scaleLevels }));
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
    const created = await createChecklistItem(checklist.id, { text: newItemText.trim(), points: 10, isRequired: true, photoRequired: false });
    setItems((prev) => [...prev, created]);
    setNewItemText('');
  }

  function updateItemLocally(itemId: string, patch: Partial<ChecklistItemSummary>) {
    setItems((prev) => applyItemPatch(prev, itemId, patch));
  }
  async function persistItem(itemId: string, patch: Partial<ChecklistItemSummary>) {
    const updated = await updateChecklistItem(itemId, patch);
    setItems((prev) => applyItemPatch(prev, itemId, updated));
  }

  async function removeItem(item: ChecklistItemSummary) {
    await deleteChecklistItem(item.id);
    setItems((prev) => removeItemById(prev, item.id));
  }
  function updateScaleLevel(index: number, patch: Partial<ChecklistScaleLevel>) {
    setScaleLevels((prev) => applyScaleLevelPatch(prev, index, patch));
  }

  function addScaleLevel() {
    setScaleLevels((prev) => appendScaleLevel(prev));
  }

  function removeScaleLevel(index: number) {
    setScaleLevels((prev) => removeScaleLevelAt(prev, index));
  }
  async function assign() {
    setAssignError(null);
    if (!assignUserId) return;
    try {
      await assignChecklist(checklist.id, assignUserId, localDateTimeToUtcIso(assignDueAt));
      setAssignUserId('');
      setAssignDueAt('');
      const updated = await listInstancesForChecklist(checklist.id);
      setInstances(updated);
    } catch (error) {
      setAssignError(error instanceof ApiClientError ? error.message : t('admin.checklists.assignError', 'Unable to assign this checklist.'));
    }
  }
  const assignableUsers = filterAssignableUsers(orgUsers, instances);
  const previewResult = computePreviewResult(items, scoringMode, scaleLevels, passThreshold, previewAnswers);
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
          <div className="admin-builder__header-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={items.length === 0}
              onClick={() => {
                setPreviewAnswers({});
                setPreviewOpen(true);
              }}
            >
              {t('admin.checklists.preview', 'Preview')}
            </Button>
            {checklist.status !== 'published' && (
              <Button
                variant="primary"
                type="button"
                disabled={items.length === 0}
                title={items.length === 0 ? t('admin.checklists.publishNoItems', 'Add at least one item before publishing.') : undefined}
                onClick={() => void publish()}
              >
                {t('admin.checklists.publish', 'Publish')}
              </Button>
            )}
          </div>
        }
      />
      <div className="admin-builder__grid">
        <div className="admin-builder__column">
          <ChecklistSettingsForm>
            <FormField id="checklist-title" label={t('admin.checklists.field.title', 'Title')}>
              <input id="checklist-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormField id="checklist-description" label={t('admin.checklists.field.description', 'Description')}>
              <textarea id="checklist-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </FormField>
          </ChecklistSettingsForm>
          <ChecklistItemsEditor>
            <h3>{t('admin.checklists.itemsTitle', 'Checklist items')} <Badge variant="neutral">{items.length}</Badge></h3>
            <ul className="admin-checklist-items">
              {items.map((item, index) => (
                <li key={item.id} className="admin-checklist-item">
                  <span className="admin-checklist-item__index">{index + 1}</span>
                  <input
                    value={item.text}
                    onChange={(e) => updateItemLocally(item.id, { text: e.target.value })}
                    onBlur={(e) => void persistItem(item.id, { text: e.target.value })}
                  />
                  {scoringMode === 'sum_points' && (
                    <input
                      type="number"
                      className="admin-checklist-item__points"
                      value={item.points}
                      onChange={(e) => updateItemLocally(item.id, { points: Number(e.target.value) })}
                      onBlur={(e) => void persistItem(item.id, { points: Number(e.target.value) })}
                      aria-label={t('admin.checklists.field.points', 'Points')}
                    />
                  )}
                  <label className="admin-checklist-item__photo">
                    <input
                      type="checkbox"
                      checked={item.isRequired}
                      onChange={(e) => {
                        updateItemLocally(item.id, { isRequired: e.target.checked });
                        void persistItem(item.id, { isRequired: e.target.checked });
                      }}
                    />
                    {t('admin.checklists.field.isRequired', 'Required item')}
                  </label>
                  <label className="admin-checklist-item__photo">
                    <input
                      type="checkbox"
                      checked={item.photoRequired}
                      onChange={(e) => {
                        updateItemLocally(item.id, { photoRequired: e.target.checked });
                        void persistItem(item.id, { photoRequired: e.target.checked });
                      }}
                    />
                    {t('admin.checklists.field.photoRequired', 'Photo required')}
                  </label>
                  <button type="button" className="admin-btn admin-btn--sm admin-btn--danger" onClick={() => void removeItem(item)}>
                    {t('admin.checklists.delete', 'Delete')}
                  </button>
                </li>
              ))}
            </ul>
            {items.length === 0 && <EmptyState message={t('admin.checklists.noItems', 'No items yet.')} />}
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
          </ChecklistItemsEditor>
        </div>
        <div className="admin-builder__column">
          <ChecklistSettingsForm>
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
          </ChecklistSettingsForm>
          <ChecklistAssignmentPanel>
            <h3>{t('admin.checklists.assignmentTitle', 'Assignment')}</h3>
            <FormField id="checklist-assign-user" label={t('admin.checklists.field.assignUser', 'Employee')} hint={t('admin.checklists.assignUserHint', 'Manual assignment for now — automatic and scheduled triggers are planned next.')}>
              <select id="checklist-assign-user" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
                <option value="">{t('admin.checklists.selectUser', 'Select an employee…')}</option>
                {assignableUsers.map((u) => (
                  <option value={u.id} key={u.id}>{formatUserName(u)}</option>
                ))}
              </select>
            </FormField>
            <FormField id="checklist-assign-due-at" label={t('admin.checklists.field.dueAt', 'Due date')} hint={t('admin.checklists.dueAtHint', 'Optional. Enter local time; it is stored as UTC.')}>
              <input
                id="checklist-assign-due-at"
                type="datetime-local"
                value={assignDueAt}
                onChange={(e) => setAssignDueAt(e.target.value)}
              />
            </FormField>
            {assignError && <p className="learner-quiz__submit-error" role="alert">{assignError}</p>}
            <Button type="button" variant="secondary" disabled={!canAssignChecklist(checklist.status, assignUserId)} onClick={() => void assign()}>
              {t('admin.checklists.assign', 'Assign')}
            </Button>
            <h4>{t('admin.checklists.instancesTitle', 'Assignments')} <Badge variant="neutral">{instances.length}</Badge></h4>
            {instances.length === 0 ? (
              <EmptyState message={t('admin.checklists.noInstances', 'Not assigned to anyone yet.')} />
            ) : (
              <ul className="admin-checklist-instances">
                {instances.map((instance) => (
                  <li key={instance.id}>
                    <span>{resolveUserName(orgUsers, instance.userId)}</span>
                    <Badge variant="neutral">{t(`admin.checklists.instanceStatus.${instance.status}`, instance.status)}</Badge>
                    <span>{instance.totalScore}/{instance.maxScore} ({instance.percentage}%)</span>
                    <ChecklistDeadlineMeta instance={instance} />
                  </li>
                ))}
              </ul>
            )}
          </ChecklistAssignmentPanel>
        </div>
      </div>
      {previewOpen && (
        <ChecklistPreviewDialog label={t('admin.checklists.previewTitle', 'Preview')}>
          <div className="admin-preview-panel">
            <div className="admin-preview-panel__header">
              <h2>{title || checklist.title}</h2>
              <button type="button" className="admin-dialog__close" aria-label={t('admin.checklists.close', 'Close')} onClick={() => setPreviewOpen(false)}>×</button>
            </div>
            <p className="admin-form__hint">{t('admin.checklists.previewHint', 'This is a local simulation — nothing here is saved or sent to anyone.')}</p>
            <ul className="admin-checklist-items">
              {items.map((item) => (
                <li key={item.id} className="admin-checklist-item admin-checklist-item--preview">
                  <span className="admin-checklist-item__index">✓</span>
                  <span className="admin-preview-item__text">
                    {item.text}{' '}
                    <small>{item.isRequired ? t('admin.checklists.requiredItem', 'Required') : t('admin.checklists.optionalItem', 'Optional')}</small>
                  </span>
                  {scoringMode === 'scale' ? (
                    <div className="admin-seg">
                      {scaleLevels.map((level) => (
                        <button
                          key={level.level}
                          type="button"
                          className={previewAnswers[item.id]?.scaleLevel === level.level ? 'admin-seg__btn admin-seg__btn--active' : 'admin-seg__btn'}
                          onClick={() => setPreviewAnswers((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], scaleLevel: level.level },
                          }))}
                        >
                          {level.points} · {level.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <label className="admin-checklist-item__photo">
                      <input
                        type="checkbox"
                        checked={previewAnswers[item.id]?.checked ?? false}
                        onChange={(e) => setPreviewAnswers((prev) => ({
                          ...prev,
                          [item.id]: { ...prev[item.id], checked: e.target.checked },
                        }))}
                      />
                      {t('admin.checklists.markDone', 'Done')}
                    </label>
                  )}
                  {item.photoRequired && (
                    <label className="admin-checklist-item__photo">
                      <input
                        type="checkbox"
                        checked={previewAnswers[item.id]?.hasPhoto ?? false}
                        onChange={(e) => setPreviewAnswers((prev) => ({
                          ...prev,
                          [item.id]: { ...prev[item.id], hasPhoto: e.target.checked },
                        }))}
                      />
                      {t('admin.checklists.previewPhotoAttached', 'Photo attached')}
                    </label>
                  )}
                </li>
              ))}
            </ul>
            <div className={previewResult.passed ? 'admin-preview-result admin-preview-result--pass' : 'admin-preview-result'}>
              <span>{previewResult.allAnswered ? (previewResult.passed ? t('admin.checklists.previewPassed', 'Pass') : t('admin.checklists.previewFailed', 'Fail')) : t('admin.checklists.previewIncomplete', 'Not all completion requirements are met yet')}</span>
              <strong>{previewResult.totalScore} / {previewResult.maxScore} ({previewResult.percentage}%)</strong>
            </div>
            <div className="admin-form__actions">
              <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setPreviewAnswers({})}>{t('admin.checklists.previewReset', 'Reset')}</button>
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => setPreviewOpen(false)}>{t('admin.checklists.close', 'Close')}</button>
            </div>
          </div>
        </ChecklistPreviewDialog>
      )}
    </div>
  );
}
