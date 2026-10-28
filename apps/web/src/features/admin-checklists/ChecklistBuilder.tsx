import { checklistItemLevels } from '../../app/checklistCompletion.js';
import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { ApiClientError } from '../../shared/apiClient.js';
import { AdminPageHeader, ConfirmDialog, FormField } from '../../shared/adminPage.js';
import { Badge, Button, EmptyState, Menu, type BadgeVariant } from '../../shared/ui.js';
import {
  copyChecklistItemGroup,
  createChecklistItem,
  createChecklistItemGroup,
  deleteChecklistItem,
  getChecklist,
  listChecklistItemGroups,
  listChecklistScales,
  updateChecklist,
  updateChecklistItem,
  updateChecklistItemGroup,
} from '../../shared/api/checklists.js';
import type {
  ChecklistAccessMode,
  ChecklistGeolocationPolicy,
  ChecklistItemGroup,
  ChecklistItemSummary,
  ChecklistPreSessionVisibility,
  ChecklistScaleLevel,
  ChecklistScaleSummary,
  ChecklistScoringMode,
  ChecklistStatus,
  ChecklistSummary,
  ContextField,
} from '../../shared/api/types.js';
import { ChecklistAccessBadge } from '../../shared/checklistAccess.js';
import { ChecklistCoverField } from './ChecklistCoverField.js';
import { ChecklistItemsEditor } from './ChecklistItemsEditor.js';
import { ChecklistPreviewDialog } from './ChecklistPreviewDialog.js';
import { ChecklistSettingsForm } from './ChecklistSettingsForm.js';
import { ScaleManagerDialog } from './ScaleManagerDialog.js';
import {
  applyContextFieldPatch,
  applyGroupPatch,
  applyItemPatch,
  appendContextField,
  appendScaleLevel,
  buildChecklistSettingsPayload,
  computePreviewResult,
  createDefaultScale,
  describeScaleLevels,
  groupItems,
  moveGroup,
  moveItem,
  removeContextFieldById,
  removeItemById,
  removeScaleLevelAt,
  SCORING_MODES,
  type PreviewAnswer,
  type SaveState,
  applyScaleLevelPatch,
} from './domain.js';

/** Pseudo-option of the criterion scale dropdown that opens the scale editor instead of picking a scale. */
const CREATE_SCALE_OPTION = '__create_scale__';

const STATUS_BADGE_VARIANT: Record<ChecklistStatus, BadgeVariant> = { draft: 'draft', published: 'published', archived: 'neutral' };

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
  const [allowFinishIncomplete, setAllowFinishIncomplete] = useState(checklist.allowFinishIncomplete ?? false);
  const [forbidGalleryPhotos, setForbidGalleryPhotos] = useState(checklist.forbidGalleryPhotos ?? false);
  const [accessMode, setAccessMode] = useState<ChecklistAccessMode>(checklist.accessMode ?? 'assigned');
  const [pinned, setPinned] = useState(checklist.pinned ?? false);
  // Defaults are system copy and follow the locale at creation time. Existing labels are authored
  // content, so changing the UI language must never rewrite them.
  const [scaleLevels, setScaleLevels] = useState<ChecklistScaleLevel[]>(() => checklist.scaleLevels ?? createDefaultScale(t));
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(buildChecklistSettingsPayload({
    title: checklist.title, description: checklist.description ?? '', scoringMode: checklist.scoringMode, passThreshold: checklist.passThreshold,
    requiresReview: checklist.requiresReview, scaleLevels: checklist.scaleLevels ?? createDefaultScale(t), defaultLocationCapturePolicy: checklist.defaultLocationCapturePolicy ?? '',
    preSessionVisibility: checklist.preSessionVisibility ?? 'structure_only', allowFinishIncomplete: checklist.allowFinishIncomplete ?? false, forbidGalleryPhotos: checklist.forbidGalleryPhotos ?? false,
    accessMode: checklist.accessMode ?? 'assigned', pinned: (checklist.accessMode ?? 'assigned') === 'free' && (checklist.pinned ?? false),
  })));
  // Items live in local state so a single keystroke or checkbox click never has to wait on (and
  // get interrupted by) a server round-trip — see the "why does the page reload" bug this fixes.
  const [items, setItems] = useState<ChecklistItemSummary[]>(checklist.items);
  const [contextFieldToDelete, setContextFieldToDelete] = useState<ContextField | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, PreviewAnswer>>({});
  // PR 296 observation-sheet builder state.
  const [itemGroups, setItemGroups] = useState<ChecklistItemGroup[]>(checklist.itemGroups ?? []);
  const [contextFields, setContextFields] = useState<ContextField[]>(checklist.contextFields ?? []);
  const [scales, setScales] = useState<ChecklistScaleSummary[]>([]);
  const [scaleManagerOpen, setScaleManagerOpen] = useState(false);
  // PR 343: the criterion whose scale dropdown asked to "Create scale" -- the new scale is assigned to it once saved.
  const [scaleCreateForItemId, setScaleCreateForItemId] = useState<string | null>(null);
  const [defaultLocationCapturePolicy, setDefaultLocationCapturePolicy] = useState<ChecklistGeolocationPolicy | ''>(checklist.defaultLocationCapturePolicy ?? '');
  const [preSessionVisibility, setPreSessionVisibility] = useState<ChecklistPreSessionVisibility>(checklist.preSessionVisibility ?? 'structure_only');
  useEffect(() => {
    listChecklistItemGroups(checklist.id).then(setItemGroups).catch(() => setItemGroups([]));
    listChecklistScales().then(setScales).catch(() => setScales([]));
  }, [checklist.id]);
  const settingsPayload = buildChecklistSettingsPayload({ title, description, scoringMode, passThreshold, requiresReview, scaleLevels, defaultLocationCapturePolicy, preSessionVisibility, allowFinishIncomplete, forbidGalleryPhotos, accessMode, pinned });
  const hasUnsavedChanges = JSON.stringify(settingsPayload) !== savedSnapshot;
  async function saveSettings() {
    setSaveState({ status: 'saving' });
    try {
      await updateChecklist(checklist.id, settingsPayload);
      setSavedSnapshot(JSON.stringify(settingsPayload));
      setSaveState({ status: 'idle' });
      setSavedAt(new Date());
      await onReload();
    } catch (error) {
      setSaveState({
        status: 'error',
        message: error instanceof ApiClientError && error.status === 409
          ? t('admin.checklists.pinnedLimit', 'Eight checklists are already pinned. Unpin one of them in its settings, then try again.')
          : error instanceof ApiClientError ? error.message : t('admin.checklists.saveError', 'Unable to save checklist.'),
      });
    }
  }
  async function reloadScales() {
    const result = await listChecklistScales().catch(() => scales);
    setScales(result);
  }
  async function addGroup() {
    const created = await createChecklistItemGroup(checklist.id, { title: t('admin.checklists.newGroupTitle', 'New group') });
    setItemGroups((prev) => [...prev, created]);
  }
  function renameGroupLocally(groupId: string, title: string) {
    setItemGroups((prev) => applyGroupPatch(prev, groupId, { title }));
  }
  async function persistGroupTitle(groupId: string, title: string) {
    const updated = await updateChecklistItemGroup(groupId, { title });
    setItemGroups((prev) => applyGroupPatch(prev, groupId, updated));
  }
  async function moveGroupDirection(groupId: string, direction: 'up' | 'down') {
    const patches = moveGroup(itemGroups, groupId, direction);
    if (patches.length === 0) return;
    setItemGroups((prev) => {
      let next = prev;
      for (const patch of patches) next = applyGroupPatch(next, patch.id, { order: patch.order });
      return next;
    });
    await Promise.all(patches.map((patch) => updateChecklistItemGroup(patch.id, { order: patch.order })));
  }
  async function moveItemDirection(itemId: string, direction: 'up' | 'down') {
    const patches = moveItem(items, itemId, direction);
    if (patches.length === 0) return;
    setItems((prev) => {
      let next = prev;
      for (const patch of patches) next = applyItemPatch(next, patch.id, { order: patch.order });
      return next;
    });
    await Promise.all(patches.map((patch) => updateChecklistItem(patch.id, { order: patch.order })));
  }
  async function copyGroup(groupId: string) {
    const newGroup = await copyChecklistItemGroup(groupId);
    setItemGroups((prev) => [...prev, newGroup]);
    // The copy endpoint duplicates the group's items server-side too -- re-fetch this checklist's
    // items so the copies show up locally (no per-group items endpoint exists to fetch just them).
    const refreshed = await getChecklist(checklist.id);
    setItems(refreshed.items);
  }
  async function addCriterionToGroup(groupId: string | null) {
    const created = await createChecklistItem(checklist.id, { text: t('admin.checklists.newCriterionText', 'New criterion'), points: 10, isRequired: true, photoRequired: false, ...(groupId ? { groupId } : {}) });
    setItems((prev) => [...prev, created]);
  }
  function addContextFieldLocally() {
    setContextFields((prev) => appendContextField(prev));
  }
  function updateContextFieldLocally(fieldId: string, patch: Partial<ContextField>) {
    setContextFields((prev) => applyContextFieldPatch(prev, fieldId, patch));
  }
  async function persistContextFields(fields: ContextField[]) {
    await updateChecklist(checklist.id, { contextFields: fields.length > 0 ? fields : null });
  }
  async function removeContextField(fieldId: string) {
    const next = removeContextFieldById(contextFields, fieldId);
    setContextFields(next);
    await persistContextFields(next);
  }
  async function publish() {
    try {
      await updateChecklist(checklist.id, { status: 'published' });
      await onReload();
    } catch (error) {
      setSaveState({ status: 'error', message: error instanceof ApiClientError ? error.message : t('admin.checklists.publishError', 'Unable to publish checklist.') });
    }
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
  const previewItems = items.map((item) => ({ ...item, scale: scales.find((scale) => scale.id === item.scaleId) ?? item.scale }));
  const previewResult = computePreviewResult(previewItems, scoringMode, scaleLevels, passThreshold, previewAnswers);
  return (
    <div className="admin-builder">
      <button type="button" className="admin-back-link" onClick={onBack}>
        ← {t('admin.checklists.backToList', 'All checklists')}
      </button>
      <AdminPageHeader
        eyebrow={t('admin.checklists.builderEyebrow', 'Observation sheet')}
        title={checklist.title}
        subtitle={
          <>
            <Badge variant={STATUS_BADGE_VARIANT[checklist.status]}>{statusLabels[checklist.status]}</Badge>
            {' '}
            <ChecklistAccessBadge checklist={{ accessMode, pinned: accessMode === 'free' && pinned }} t={t} />
            {savedAt && (
              <span role="status" style={{ marginLeft: 8, fontSize: '0.95rem' }}>
                {t('admin.checklists.savedAt', 'Saved at {{time}}', { time: savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
              </span>
            )}
          </>
        }
        action={
          <div className="admin-builder__header-actions">
            <Button type="button" variant="secondary" onClick={() => setScaleManagerOpen(true)}>
              {t('admin.checklists.scaleManager.title', 'Evaluation scales')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={items.length === 0}
              aria-describedby={items.length === 0 ? 'checklist-needs-items' : undefined}
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
                aria-describedby={items.length === 0 ? 'checklist-needs-items' : undefined}
                title={items.length === 0 ? t('admin.checklists.publishNoItems', 'Add at least one item before publishing.') : undefined}
                onClick={() => void publish()}
              >
                {t('admin.checklists.publish', 'Publish')}
              </Button>
            )}
          </div>
        }
      />
      {items.length === 0 && (
        <p id="checklist-needs-items" role="note" className="admin-form__hint">
          {t('admin.checklists.needItemsHint', 'Preview and Publish become available after you add at least one criterion.')}
        </p>
      )}
      <div className="admin-builder__grid">
        <div className="admin-builder__column">
          <ChecklistSettingsForm>
            <FormField id="checklist-title" label={t('admin.checklists.field.title', 'Title')}>
              <input id="checklist-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormField id="checklist-description" label={t('admin.checklists.field.description', 'Description')}>
              <textarea id="checklist-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </FormField>
            <ChecklistCoverField checklistId={checklist.id} title={checklist.title} coverUpdatedAt={checklist.coverUpdatedAt} />
          </ChecklistSettingsForm>
          <ChecklistItemsEditor>
            <h3>{t('admin.checklists.contextFieldsTitle', 'General information')} <Badge variant="neutral">{contextFields.length}</Badge></h3>
            <p className="admin-form__hint">{t('admin.checklists.contextFieldsHint', 'Filled in by the observer before the criteria.')}</p>
            <div className="admin-context-fields">
              {contextFields.map((field) => (
                <div className="admin-context-field-row" key={field.id}>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span>{t('admin.checklists.contextFieldLabel', 'Field label')}</span>
                    <input
                      onBlur={(e) => void persistContextFields(applyContextFieldPatch(contextFields, field.id, { label: e.target.value }))}
                      onChange={(e) => updateContextFieldLocally(field.id, { label: e.target.value })}
                      type="text"
                      value={field.label}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span>{t('admin.checklists.contextFieldTypeLabel', 'Field type')}</span>
                    <select
                      onChange={(e) => {
                        const type = e.target.value as ContextField['type'];
                        updateContextFieldLocally(field.id, { type });
                        void persistContextFields(applyContextFieldPatch(contextFields, field.id, { type }));
                      }}
                      value={field.type}
                    >
                      <option value="text">{t('admin.checklists.contextFieldType.text', 'Text')}</option>
                      <option value="textarea">{t('admin.checklists.contextFieldType.textarea', 'Multiline text')}</option>
                      <option value="date">{t('admin.checklists.contextFieldType.date', 'Date')}</option>
                    </select>
                  </label>
                  <label className="admin-checklist-item__photo">
                    <input
                      checked={field.required}
                      onChange={(e) => {
                        updateContextFieldLocally(field.id, { required: e.target.checked });
                        void persistContextFields(applyContextFieldPatch(contextFields, field.id, { required: e.target.checked }));
                      }}
                      type="checkbox"
                    />
                    {t('admin.checklists.contextFieldRequired', 'Required')}
                  </label>
                  <Menu
                    align="end"
                    buttonClassName="admin-btn admin-btn--sm"
                    label={<><span aria-hidden="true">⋮</span><span className="ui-visually-hidden">{t('admin.checklists.contextFieldActions', 'Field actions: {{name}}', { name: field.label || t('admin.checklists.contextFieldLabel', 'Field label') })}</span></>}
                  >
                    <button onClick={() => setContextFieldToDelete(field)} role="menuitem" type="button">
                      {t('admin.checklists.delete', 'Delete')}
                    </button>
                  </Menu>
                </div>
              ))}
            </div>
            <Button onClick={() => { addContextFieldLocally(); void persistContextFields(appendContextField(contextFields)); }} type="button" variant="secondary" size="sm">
              + {t('admin.checklists.addContextField', 'Field')}
            </Button>
          </ChecklistItemsEditor>
          <ChecklistItemsEditor>
            <div className="admin-builder-section-head">
              <h3>{t('admin.checklists.groupsTitle', 'Groups and criteria')} <Badge variant="neutral">{items.length}</Badge></h3>
              <Button type="button" variant="primary" size="sm" onClick={() => void addGroup()}>
                + {t('admin.checklists.addGroup', 'Group')}
              </Button>
            </div>
            {groupItems(items, itemGroups).map(({ group, items: groupedItems }, groupIndex, allGroups) => (
              <div className="admin-group-card" key={group?.id ?? 'ungrouped'}>
                <div className="admin-group-card__head">
                  <div>
                    {group ? (
                      <input
                        aria-label={t('admin.checklists.groupTitle', 'Group title')}
                        onBlur={(e) => void persistGroupTitle(group.id, e.target.value)}
                        onChange={(e) => renameGroupLocally(group.id, e.target.value)}
                        value={group.title}
                      />
                    ) : itemGroups.length > 0 ? (
                      <h4>{t('admin.checklists.ungroupedItems', 'Ungrouped')}</h4>
                    ) : null}
                    <p className="admin-group-card__count">{t('admin.checklists.groupCriterionCount', '{{count}} criteria', { count: groupedItems.length })}</p>
                  </div>
                  <div className="admin-group-card__actions">
                    {group && (
                      <>
                        <button className="admin-btn admin-btn--sm" disabled={groupIndex === 0} onClick={() => void moveGroupDirection(group.id, 'up')} type="button" aria-label={t('admin.checklists.moveNamedUp', 'Move up: {{name}}', { name: group.title })}>↑</button>
                        <button className="admin-btn admin-btn--sm" disabled={groupIndex === allGroups.filter((b) => b.group).length - 1} onClick={() => void moveGroupDirection(group.id, 'down')} type="button" aria-label={t('admin.checklists.moveNamedDown', 'Move down: {{name}}', { name: group.title })}>↓</button>
                        <button className="admin-btn admin-btn--sm" onClick={() => void copyGroup(group.id)} type="button">{t('admin.checklists.copyGroup', 'Copy')}</button>
                      </>
                    )}
                    <button className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => void addCriterionToGroup(group?.id ?? null)} type="button">
                      + {t('admin.checklists.addCriterion', 'Criterion')}
                    </button>
                  </div>
                </div>
                {groupedItems.length > 0 && (
                  <div className="admin-criteria-table" role="table" aria-label={t('admin.checklists.groupsTitle', 'Groups and criteria')}>
                    <div className="admin-criteria-row admin-criteria-row--head" role="row">
                      <span className="admin-criteria-row__order" aria-hidden="true" />
                      <span className="admin-criteria-row__text">{t('admin.checklists.field.criterion', 'Criterion')}</span>
                      <span className="admin-criteria-row__scale">{t('admin.checklists.field.scale', 'Scale')}</span>
                      {scoringMode === 'sum_points' && <span className="admin-criteria-row__points">{t('admin.checklists.field.points', 'Points')}</span>}
                      <span className="admin-criteria-row__weight">{t('admin.checklists.field.weight', 'Weight')}</span>
                      <span className="admin-criteria-row__toggle">{t('admin.checklists.criteriaTable.required', 'Required')}</span>
                      <span className="admin-criteria-row__toggle">{t('admin.checklists.criteriaTable.photo', 'Photo')}</span>
                      <span className="admin-criteria-row__menu" aria-hidden="true" />
                    </div>
                    {groupedItems.map((item, itemIndex) => (
                      <div className="admin-criteria-row" role="row" key={item.id}>
                        <div className="admin-criteria-row__order">
                          <button disabled={itemIndex === 0} onClick={() => void moveItemDirection(item.id, 'up')} type="button" aria-label={t('admin.checklists.moveNamedUp', 'Move up: {{name}}', { name: item.text })}>↑</button>
                          <button disabled={itemIndex === groupedItems.length - 1} onClick={() => void moveItemDirection(item.id, 'down')} type="button" aria-label={t('admin.checklists.moveNamedDown', 'Move down: {{name}}', { name: item.text })}>↓</button>
                        </div>
                        <input
                          className="admin-criteria-row__text"
                          value={item.text}
                          onChange={(e) => updateItemLocally(item.id, { text: e.target.value })}
                          onBlur={(e) => void persistItem(item.id, { text: e.target.value })}
                          aria-label={t('admin.checklists.field.criterion', 'Criterion')}
                        />
                        <select
                          className="admin-criteria-row__scale"
                          value={item.scaleId ?? ''}
                          onChange={(e) => {
                            if (e.target.value === CREATE_SCALE_OPTION) {
                              setScaleCreateForItemId(item.id);
                              return;
                            }
                            void persistItem(item.id, { scaleId: e.target.value || null });
                          }}
                          title={describeScaleLevels(scales.find((s) => s.id === item.scaleId)?.levels ?? [])}
                          aria-label={t('admin.checklists.field.scale', 'Scale')}
                        >
                          <option value={CREATE_SCALE_OPTION}>+ {t('admin.checklists.scaleManager.createOption', 'Create scale')}</option>
                          <option value="">{t('admin.checklists.noScale', 'No scale')}</option>
                          {scales.filter((s) => s.status === 'active' || s.id === item.scaleId).map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        {scoringMode === 'sum_points' && (
                          <input
                            type="number"
                            className="admin-criteria-row__points"
                            value={item.points}
                            onChange={(e) => updateItemLocally(item.id, { points: Number(e.target.value) })}
                            onBlur={(e) => void persistItem(item.id, { points: Number(e.target.value) })}
                            aria-label={t('admin.checklists.field.points', 'Points')}
                          />
                        )}
                        <input
                          type="number"
                          className="admin-criteria-row__weight"
                          min={1}
                          value={item.weight ?? 1}
                          onChange={(e) => updateItemLocally(item.id, { weight: Number(e.target.value) })}
                          onBlur={(e) => void persistItem(item.id, { weight: Number(e.target.value) })}
                          aria-label={t('admin.checklists.field.weight', 'Weight')}
                          title={t('admin.checklists.field.weight', 'Weight')}
                        />
                        <div className="admin-criteria-row__toggle">
                          <input
                            className="admin-switch"
                            type="checkbox"
                            checked={item.isRequired}
                            onChange={(e) => {
                              updateItemLocally(item.id, { isRequired: e.target.checked });
                              void persistItem(item.id, { isRequired: e.target.checked });
                            }}
                            aria-label={t('admin.checklists.field.isRequired', 'Required item')}
                          />
                        </div>
                        <div className="admin-criteria-row__toggle">
                          <input
                            className="admin-switch"
                            type="checkbox"
                            checked={item.photoRequired}
                            onChange={(e) => {
                              updateItemLocally(item.id, { photoRequired: e.target.checked });
                              void persistItem(item.id, { photoRequired: e.target.checked });
                            }}
                            aria-label={t('admin.checklists.field.photoRequired', 'Photo required')}
                          />
                        </div>
                        <Menu
                          align="end"
                          buttonClassName="admin-btn admin-btn--sm"
                          className="admin-criteria-row__menu"
                          label={<><span aria-hidden="true">⋮</span><span className="ui-visually-hidden">{t('admin.checklists.rowActions', 'Actions')}</span></>}
                        >
                          <button onClick={() => void removeItem(item)} role="menuitem" type="button">
                            {t('admin.checklists.delete', 'Delete')}
                          </button>
                        </Menu>
                      </div>
                    ))}
                  </div>
                )}
                {groupedItems.length === 0 && <EmptyState message={t('admin.checklists.noItems', 'No items yet.')} />}
              </div>
            ))}
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
            <p className="admin-form__hint" role="note">
              {t(`admin.checklists.scoringModeInfo.${scoringMode}`, scoringMode)}
            </p>
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
                <p className="admin-form__hint">{t('admin.checklists.scaleLevelsCriterionHint', 'A criterion can also use its own ready-made scale, chosen in the criteria table; without one, the levels above apply.')}</p>
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
            <FormField id="checklist-access-mode" label={t('admin.checklists.field.accessMode', 'How the checklist is taken')} hint={t(`admin.checklists.accessModeHint.${accessMode}`, accessMode)}>
              <select
                id="checklist-access-mode"
                value={accessMode}
                onChange={(e) => setAccessMode(e.target.value as ChecklistAccessMode)}
              >
                <option value="assigned">{t('admin.checklists.accessMode.assigned', 'By assignment')}</option>
                <option value="free">{t('admin.checklists.accessMode.free', 'Free access')}</option>
              </select>
            </FormField>
            {accessMode === 'free' && (
              <label className="admin-checkbox-field">
                <input
                  type="checkbox"
                  checked={pinned}
                  disabled={checklist.status !== 'published'}
                  onChange={(e) => setPinned(e.target.checked)}
                />
                <span>
                  {t('admin.checklists.field.pinned', 'Pin to the dashboard')}
                  <small className="admin-form__hint">
                    {checklist.status === 'published'
                      ? t('admin.checklists.pinnedHint', 'Shows the checklist as a tile at the top of the learner pages. Up to 8 checklists can be pinned.')
                      : t('admin.checklists.pinnedDraftHint', 'Available once the checklist is published.')}
                  </small>
                </span>
              </label>
            )}
            <details>
              <summary>{t('admin.checklists.advancedTitle', 'Additional settings')}</summary>
            <label className="admin-checkbox-field">
              <input type="checkbox" checked={requiresReview} onChange={(e) => setRequiresReview(e.target.checked)} />
              {t('admin.checklists.field.requiresReview', 'Require an instructor to confirm the result before it counts')}
            </label>
            <p className="admin-form__hint">
              {t('admin.checklists.requiresReviewHint', 'When enabled, learner submissions are computed automatically but stay pending until an instructor or manager approves each item.')}
            </p>
            <label className="admin-checkbox-field">
              <input type="checkbox" checked={allowFinishIncomplete} onChange={(e) => setAllowFinishIncomplete(e.target.checked)} />
              {t('admin.checklists.field.allowFinishIncomplete', 'Allow finishing a session with unanswered criteria')}
            </label>
            <p className="admin-form__hint">
              {t('admin.checklists.allowFinishIncompleteHint', 'The observer can complete the session without answering every criterion. Unanswered criteria are recorded as skipped and are not counted in the result. Applies to sessions assigned after you save.')}
            </p>
            {(items.some((item) => item.photoRequired) || forbidGalleryPhotos) && (
              <>
                <label className="admin-checkbox-field">
                  <input type="checkbox" checked={forbidGalleryPhotos} onChange={(e) => setForbidGalleryPhotos(e.target.checked)} />
                  {t('admin.checklists.field.forbidGalleryPhotos', 'Photos only from the camera, not from the gallery')}
                </label>
                <p className="admin-form__hint">
                  {t('admin.checklists.forbidGalleryPhotosHint', 'The photo button opens the camera on phones. This is a convenience for the person filling in the checklist, not protection: the system cannot check where a photo was taken from. Applies to sessions assigned after you save.')}
                </p>
              </>
            )}
            <FormField id="checklist-default-location-policy" label={t('admin.checklists.field.defaultLocationCapturePolicy', 'Location requirement')} hint={t('admin.checklists.defaultLocationCapturePolicyHint', 'Pre-fills the location capture policy when scheduling a session for this checklist.')}>
              <select
                id="checklist-default-location-policy"
                value={defaultLocationCapturePolicy}
                onChange={(e) => setDefaultLocationCapturePolicy(e.target.value as ChecklistGeolocationPolicy | '')}
              >
                <option value="">{t('admin.checklists.orgDefault', 'Organization default')}</option>
                <option value="off">{t('admin.checklists.sessions.wizard.locationOff', 'Off')}</option>
                <option value="optional">{t('admin.checklists.sessions.wizard.locationOptional', 'Optional')}</option>
                <option value="required">{t('admin.checklists.sessions.wizard.locationRequired', 'Required')}</option>
              </select>
            </FormField>
            <FormField id="checklist-pre-session-visibility" label={t('admin.checklists.field.preSessionVisibility', 'Employee sees before the session')}>
              <select
                id="checklist-pre-session-visibility"
                value={preSessionVisibility}
                onChange={(e) => setPreSessionVisibility(e.target.value as ChecklistPreSessionVisibility)}
              >
                <option value="full">{t('admin.checklists.preSessionVisibility.full', 'Structure and past feedback')}</option>
                <option value="structure_only">{t('admin.checklists.preSessionVisibility.structure_only', 'Structure only')}</option>
                <option value="none">{t('admin.checklists.preSessionVisibility.none', 'Nothing')}</option>
              </select>
            </FormField>
            </details>
            {saveState.status === 'error' && <p className="learner-quiz__submit-error" role="alert">{saveState.message}</p>}
            <p role="status" className="admin-form__hint">
              {hasUnsavedChanges
                ? t('admin.checklists.unsavedChanges', 'There are unsaved changes.')
                : t('admin.checklists.allSaved', 'All changes are saved.')}
            </p>
            <Button type="button" variant="primary" disabled={saveState.status === 'saving'} onClick={() => void saveSettings()}>
              {saveState.status === 'saving' ? t('admin.checklists.saving', 'Saving...') : t('admin.checklists.save', 'Save')}
            </Button>
          </ChecklistSettingsForm>
        </div>
      </div>
      <ConfirmDialog
        open={contextFieldToDelete !== null}
        title={t('admin.checklists.contextFieldDeleteTitle', 'Delete field')}
        message={t('admin.checklists.contextFieldDeleteConfirm', 'Delete the field "{{name}}"? Sessions assigned from now on will no longer ask for it; sessions already started keep it.', { name: contextFieldToDelete?.label ?? '' })}
        confirmLabel={t('admin.checklists.delete', 'Delete')}
        cancelLabel={t('admin.checklists.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => {
          const target = contextFieldToDelete;
          setContextFieldToDelete(null);
          if (target) void removeContextField(target.id);
        }}
        onCancel={() => setContextFieldToDelete(null)}
      />
      {previewOpen && (
        <ChecklistPreviewDialog label={t('admin.checklists.previewTitle', 'Preview')}>
          <div className="admin-preview-panel">
            <div className="admin-preview-panel__header">
              <h2>{title || checklist.title}</h2>
              <button type="button" className="admin-dialog__close" aria-label={t('admin.checklists.close', 'Close')} onClick={() => setPreviewOpen(false)}>×</button>
            </div>
            <p className="admin-form__hint">{t('admin.checklists.previewHint', 'This is a local simulation — nothing here is saved or sent to anyone.')}</p>
            <ul className="admin-checklist-items">
              {previewItems.map((item) => {
                const levels = checklistItemLevels(item, scoringMode, scaleLevels);
                return (
                  <li key={item.id} className="admin-checklist-item admin-checklist-item--preview">
                    <span className="admin-checklist-item__index">✓</span>
                    <span className="admin-preview-item__text">
                      {item.text}{' '}
                      <small>{item.isRequired ? t('admin.checklists.requiredItem', 'Required') : t('admin.checklists.optionalItem', 'Optional')}</small>
                    </span>
                    {levels !== null ? (
                      <div className="admin-seg">
                        {levels.map((level) => (
                          <button
                            key={level.level}
                            type="button"
                            aria-pressed={previewAnswers[item.id]?.scaleLevel === level.level}
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
                );
              })}
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
      <ScaleManagerDialog onChanged={() => void reloadScales()} onClose={() => setScaleManagerOpen(false)} open={scaleManagerOpen} t={t} />
      <ScaleManagerDialog
        onChanged={() => void reloadScales()}
        onClose={() => setScaleCreateForItemId(null)}
        onSaved={(scale) => {
          const itemId = scaleCreateForItemId;
          setScaleCreateForItemId(null);
          if (itemId) void persistItem(itemId, { scaleId: scale.id });
        }}
        open={scaleCreateForItemId !== null}
        startCreating
        t={t}
      />
    </div>
  );
}
