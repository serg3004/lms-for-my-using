import type { FeedbackLayout } from '@lms/shared/checklist-feedback';
import { FeedbackBuilder } from '../checklist-feedback/FeedbackBuilder.js';
import { useEffect, useRef, useState } from 'react';
import { verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useOptionalSession } from '../../shared/session.js';
import type { TFunction } from 'i18next';
import { ApiClientError } from '../../shared/apiClient.js';
import { AdminPageHeader, ConfirmDialog, FormField } from '../../shared/adminPage.js';
import { Badge, Button, ConfirmDialog as RichConfirmDialog, EmptyState, Menu, type BadgeVariant } from '../../shared/ui.js';
import {
  copyChecklistItemGroup,
  createChecklistItem,
  createChecklistOrgTemplate,
  createChecklistItemGroup,
  deleteChecklistItem,
  deleteChecklistItemGroup,
  saveChecklistLayout,
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
import { ContextMenu, useContextMenu } from '../../shared/ContextMenu.js';
import { InlineNameField, focusNameField } from './InlineNameField.js';
import { ChecklistCoverField } from './ChecklistCoverField.js';
import { ChecklistCheckboxOption, ChecklistHelpTip } from './ChecklistHelpTip.js';
import { ChecklistItemsEditor } from './ChecklistItemsEditor.js';
import { DndContext, DragHandle, GroupShell, ItemsSortable, SortableBox, SortableContext, useChecklistLayoutDnd } from './ChecklistSortable.js';
import { applyLayout, toLayoutPayload, type Layout } from './layout.js';
import { ChecklistModuleSettingsBlock } from './ChecklistModuleSettings.js';
import { ChecklistPreviewDialog } from './ChecklistPreviewDialog.js';
import { ChecklistSettingsForm } from './ChecklistSettingsForm.js';
import { ItemDetailsDialog, noteAnswerOptions, type NoteAnswerOption } from './ItemDetailsDialog.js';
import { ScaleManagerDialog } from './ScaleManagerDialog.js';
import {
  applyContextFieldPatch,
  applyGroupPatch,
  applyItemPatch,
  appendContextField,
  appendScaleLevel,
  buildChecklistSettingsPayload,
  createDefaultScale,
  describeScaleLevels,
  groupItems,
  moveGroup,
  moveItem,
  removeContextFieldById,
  removeItemById,
  removeScaleLevelAt,
  SCORING_MODES,
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
  // PR 397: per-sheet overrides of the organization module settings (geolocation is `defaultLocationCapturePolicy`).
  const storedModuleSettings = {
    thresholds: checklist.moduleSettings?.thresholds ?? null,
    resultColors: checklist.moduleSettings?.resultColors ?? null,
    feedbackVisibility: checklist.moduleSettings?.feedbackVisibility ?? null,
    observers: checklist.moduleSettings?.observers ?? null,
  };
  const [moduleSettings, setModuleSettings] = useState(storedModuleSettings);
  const [description, setDescription] = useState(checklist.description ?? '');
  const [scoringMode, setScoringMode] = useState<ChecklistScoringMode>(checklist.scoringMode);
  const [passThreshold, setPassThreshold] = useState(checklist.passThreshold);
  const [requiresReview, setRequiresReview] = useState(checklist.requiresReview);
  const [allowFinishIncomplete, setAllowFinishIncomplete] = useState(checklist.allowFinishIncomplete ?? false);
  const [forbidGalleryPhotos, setForbidGalleryPhotos] = useState(checklist.forbidGalleryPhotos ?? false);
  const [feedbackLayout, setFeedbackLayout] = useState<FeedbackLayout | null>(checklist.feedbackLayout ?? null);
  const [feedbackEnabled, setFeedbackEnabled] = useState(checklist.feedbackEnabled ?? true);
  const [feedbackRequired, setFeedbackRequired] = useState(checklist.feedbackRequired ?? false);
  const [allowSkipAll, setAllowSkipAll] = useState(checklist.allowSkipAll ?? false);
  const [accessMode, setAccessMode] = useState<ChecklistAccessMode>(checklist.accessMode ?? 'assigned');
  const [pinned, setPinned] = useState(checklist.pinned ?? false);
  // PR 362в: the creator and admins decide who may edit; everyone else sees the sheet read-only when it is closed.
  const currentUser = useOptionalSession()?.currentUser;
  // PR 366: only an administrator switches a checklist to or from the free-access mode.
  const canSwitchAccessMode = !currentUser || currentUser.roles.includes('admin');
  // PR 367: only an administrator saves a sheet as a template of the organization (the server enforces it too).
  const canManageTemplates = currentUser?.roles.includes('admin') ?? false;
  const [templateState, setTemplateState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  async function saveAsTemplate() {
    setTemplateState('saving');
    try {
      await createChecklistOrgTemplate(checklist.id);
      setTemplateState('saved');
    } catch {
      setTemplateState('error');
    }
  }
  const canManageEditAccess = !currentUser || currentUser.roles.includes('admin') || checklist.createdBy === currentUser.id;
  const canEdit = canManageEditAccess || (checklist.allowEditByAll ?? true);
  const [allowEditByAll, setAllowEditByAll] = useState(checklist.allowEditByAll ?? true);
  // Defaults are system copy and follow the locale at creation time. Existing labels are authored
  // content, so changing the UI language must never rewrite them.
  const [scaleLevels, setScaleLevels] = useState<ChecklistScaleLevel[]>(() => checklist.scaleLevels ?? createDefaultScale(t));
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(buildChecklistSettingsPayload({
    title: checklist.title, description: checklist.description ?? '', scoringMode: checklist.scoringMode, passThreshold: checklist.passThreshold,
    requiresReview: checklist.requiresReview, scaleLevels: checklist.scaleLevels ?? createDefaultScale(t), defaultLocationCapturePolicy: checklist.defaultLocationCapturePolicy ?? '',
    preSessionVisibility: checklist.preSessionVisibility ?? 'structure_only', allowFinishIncomplete: checklist.allowFinishIncomplete ?? false, forbidGalleryPhotos: checklist.forbidGalleryPhotos ?? false,
    feedbackLayout: checklist.feedbackLayout ?? null, feedbackEnabled: checklist.feedbackEnabled ?? true, feedbackRequired: checklist.feedbackRequired ?? false, allowSkipAll: checklist.allowSkipAll ?? false,
    accessMode: checklist.accessMode ?? 'assigned', pinned: (checklist.accessMode ?? 'assigned') === 'free' && (checklist.pinned ?? false),
    allowEditByAll: canManageEditAccess ? (checklist.allowEditByAll ?? true) : undefined,
    moduleSettings: storedModuleSettings,
  })));
  // Items live in local state so a single keystroke or checkbox click never has to wait on (and
  // get interrupted by) a server round-trip — see the "why does the page reload" bug this fixes.
  const [items, setItems] = useState<ChecklistItemSummary[]>(checklist.items);
  const [contextFieldToDelete, setContextFieldToDelete] = useState<ContextField | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // PR 296 observation-sheet builder state.
  const [itemGroups, setItemGroups] = useState<ChecklistItemGroup[]>(checklist.itemGroups ?? []);
  const [groupToDelete, setGroupToDelete] = useState<ChecklistItemGroup | null>(null);
  const [detailsItemId, setDetailsItemId] = useState<string | null>(null);
  const [keepItemsOnGroupDelete, setKeepItemsOnGroupDelete] = useState(false);
  const layoutDnd = useChecklistLayoutDnd({ items, groups: itemGroups, t, onCommit: (layout) => void commitLayout(layout) });
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
  const settingsPayload = buildChecklistSettingsPayload({ title, description, scoringMode, passThreshold, requiresReview, scaleLevels, defaultLocationCapturePolicy, preSessionVisibility, allowFinishIncomplete, forbidGalleryPhotos, feedbackLayout, feedbackEnabled, feedbackRequired, allowSkipAll, accessMode, pinned, allowEditByAll: canManageEditAccess ? allowEditByAll : undefined, moduleSettings });
  const hasUnsavedChanges = JSON.stringify(settingsPayload) !== savedSnapshot;
  function settingsErrorMessage(error: unknown) {
    return error instanceof ApiClientError && error.status === 409
      ? t('admin.checklists.pinnedLimit', 'Eight checklists are already pinned. Unpin one of them in its settings, then try again.')
      : error instanceof ApiClientError ? error.message : t('admin.checklists.saveError', 'Unable to save checklist.');
  }
  /** PR 417: where a failed save shows its error: next to the Save button, or in the top bar next to Publish. */
  const [headerError, setHeaderError] = useState<string | null>(null);
  async function saveSettings(origin: 'form' | 'header' = 'form'): Promise<boolean> {
    setSaveState({ status: 'saving' });
    setHeaderError(null);
    try {
      await updateChecklist(checklist.id, settingsPayload);
      setSavedSnapshot(JSON.stringify(settingsPayload));
      setSaveState({ status: 'idle' });
      setSavedAt(new Date());
      await onReload();
      return true;
    } catch (error) {
      if (origin === 'header') {
        setSaveState({ status: 'idle' });
        setHeaderError(settingsErrorMessage(error));
      } else {
        setSaveState({ status: 'error', message: settingsErrorMessage(error) });
      }
      return false;
    }
  }
  /** PR 417: "Cancel" in the unsaved bar: every settings field returns to what is stored on the server. */
  function discardChanges() {
    setTitle(checklist.title);
    setDescription(checklist.description ?? '');
    setScoringMode(checklist.scoringMode);
    setPassThreshold(checklist.passThreshold);
    setRequiresReview(checklist.requiresReview);
    setAllowFinishIncomplete(checklist.allowFinishIncomplete ?? false);
    setForbidGalleryPhotos(checklist.forbidGalleryPhotos ?? false);
    setFeedbackLayout(checklist.feedbackLayout ?? null);
    setFeedbackEnabled(checklist.feedbackEnabled ?? true);
    setFeedbackRequired(checklist.feedbackRequired ?? false);
    setAllowSkipAll(checklist.allowSkipAll ?? false);
    setAccessMode(checklist.accessMode ?? 'assigned');
    setPinned(checklist.pinned ?? false);
    setAllowEditByAll(checklist.allowEditByAll ?? true);
    setScaleLevels(checklist.scaleLevels ?? createDefaultScale(t));
    setDefaultLocationCapturePolicy(checklist.defaultLocationCapturePolicy ?? '');
    setPreSessionVisibility(checklist.preSessionVisibility ?? 'structure_only');
    setModuleSettings(storedModuleSettings);
    setSaveState({ status: 'idle' });
    setHeaderError(null);
  }
  // PR 417: leaving with unsaved settings (the back link, a menu link, closing the tab) asks what to do.
  const unsavedGuard = hasUnsavedChanges && canEdit;
  const [leave, setLeave] = useState<{ proceed: () => void } | null>(null);
  const bypassLeaveGuard = useRef(false);
  useEffect(() => {
    if (!unsavedGuard) return undefined;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const guard = (event: MouseEvent) => {
      if (bypassLeaveGuard.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.getAttribute('href')?.startsWith('#') || link.target === '_blank') return;
      event.preventDefault();
      event.stopPropagation();
      setLeave({ proceed: () => { bypassLeaveGuard.current = true; link.click(); bypassLeaveGuard.current = false; } });
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guard, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guard, true); };
  }, [unsavedGuard]);
  function requestBack() {
    if (unsavedGuard) setLeave({ proceed: onBack });
    else onBack();
  }
  /** PR 417: Preview shows the saved sheet, so unsaved settings are saved first; a failed save keeps the editor as it is. */
  async function openPreview() {
    if (hasUnsavedChanges && canEdit && !(await saveSettings('header'))) return;
    setPreviewOpen(true);
  }
  async function reloadScales() {
    const result = await listChecklistScales().catch(() => scales);
    setScales(result);
  }
  async function addGroup() {
    const created = await createChecklistItemGroup(checklist.id, { title: t('admin.checklists.newGroupTitle', 'New group') });
    setItemGroups((prev) => [...prev, created]);
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
  async function commitLayout(layout: Layout) {
    const previous = { items, groups: itemGroups };
    const next = applyLayout(items, itemGroups, layout);
    setItems(next.items);
    setItemGroups(next.groups);
    try {
      await saveChecklistLayout(checklist.id, toLayoutPayload(layout));
    } catch (error) {
      setItems(previous.items);
      setItemGroups(previous.groups);
      const conflict = error instanceof ApiClientError && error.status === 409;
      setSaveState({
        status: 'error',
        message: conflict
          ? t('admin.checklists.dnd.conflict', 'The checklist was changed elsewhere. The latest version is loaded, repeat the move.')
          : t('admin.checklists.dnd.error', 'Unable to save the new order. The previous order is restored.'),
      });
      if (conflict) {
        const [refreshed, groups] = await Promise.all([getChecklist(checklist.id), listChecklistItemGroups(checklist.id)]);
        setItems(refreshed.items);
        setItemGroups(groups);
      }
    }
  }
  async function confirmDeleteGroup(group: ChecklistItemGroup, keepItems: boolean) {
    try {
      await deleteChecklistItemGroup(group.id, keepItems ? 'keep' : 'delete');
      setItemGroups((prev) => prev.filter((entry) => entry.id !== group.id));
      setItems((prev) => (keepItems
        ? prev.map((item) => (item.groupId === group.id ? { ...item, groupId: null } : item))
        : prev.filter((item) => item.groupId !== group.id)));
    } catch (error) {
      setSaveState({ status: 'error', message: error instanceof ApiClientError ? error.message : t('admin.checklists.groupDeleteError', 'Unable to delete the group.') });
    }
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
    const created = await createChecklistItem(checklist.id, { text: t('admin.checklists.newCriterionText', 'New criterion'), points: 10, isRequired: true, photoRequired: false, scaleId: null, ...(groupId ? { groupId } : {}) });
    setItems((prev) => [...prev, created]);
  }
  /** PR 414: the scale a criterion gets when its switch is turned on: the organization's "Yes/No" first, else the first active one. */
  function defaultScaleForSwitch() {
    return scales.find((scale) => scale.isDefault && scale.status === 'active') ?? scales.find((scale) => scale.status === 'active') ?? null;
  }
  async function setItemScaleEnabled(item: ChecklistItemSummary, enabled: boolean) {
    if (!enabled) { updateItemLocally(item.id, { scaleId: null }); await persistItem(item.id, { scaleId: null }); return; }
    const scale = defaultScaleForSwitch();
    if (!scale) { setScaleCreateForItemId(item.id); return; }
    updateItemLocally(item.id, { scaleId: scale.id });
    await persistItem(item.id, { scaleId: scale.id });
  }
  /** "Enable the scale for all criteria" / "Disable it for all": one request per criterion that changes. */
  async function setAllScalesEnabled(enabled: boolean) {
    const scale = enabled ? defaultScaleForSwitch() : null;
    if (enabled && !scale) return;
    for (const item of items.filter((entry) => (enabled ? !entry.scaleId : !!entry.scaleId))) {
      await persistItem(item.id, { scaleId: scale?.id ?? null });
    }
  }
  function updateContextFieldLocally(fieldId: string, patch: Partial<ContextField>) {
    setContextFields((prev) => applyContextFieldPatch(prev, fieldId, patch));
  }
  /** PR 413: a field without a name is not sent (the server refuses it and would reject the whole list); it waits for its name. */
  async function persistContextFields(fields: ContextField[]) {
    const named = fields.filter((field) => field.label.trim() !== '');
    await updateChecklist(checklist.id, { contextFields: named.length > 0 ? named : null });
  }
  // PR 413: right button / menu key / long press on a group, a criterion or a field of "General information".
  const rowMenu = useContextMenu<{ kind: 'group' | 'item' | 'field'; id: string }>();
  async function removeContextField(fieldId: string) {
    const next = removeContextFieldById(contextFields, fieldId);
    setContextFields(next);
    await persistContextFields(next);
  }
  /** PR 417: unsaved settings travel in the same request as the status, so the sheet is never published with old settings. */
  async function publish() {
    setHeaderError(null);
    const withSettings = hasUnsavedChanges && canEdit;
    try {
      await updateChecklist(checklist.id, withSettings ? { ...settingsPayload, status: 'published' } : { status: 'published' });
      if (withSettings) setSavedSnapshot(JSON.stringify(settingsPayload));
      await onReload();
    } catch (error) {
      setHeaderError(error instanceof ApiClientError ? (error.status === 409 ? settingsErrorMessage(error) : error.message) : t('admin.checklists.publishError', 'Unable to publish checklist.'));
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
  /** PR 415: the answers that can open a criterion's explanation: its scale's levels, the sheet's levels, or "not ticked". */
  function noteOptionsFor(item: ChecklistItemSummary): NoteAnswerOption[] {
    const own = scales.find((scale) => scale.id === item.scaleId)?.levels ?? item.scale?.levels ?? null;
    if (own) return noteAnswerOptions(own, t);
    if (scoringMode === 'scale') return noteAnswerOptions(scaleLevels.map((level) => ({ value: level.level, label: level.label })), t);
    return noteAnswerOptions(null, t);
  }
  function describeItemDetails(item: ChecklistItemSummary) {
    const parts: string[] = [];
    if (item.descriptionEnabled) parts.push(t('admin.checklists.itemDetails.summaryDescription', 'Description'));
    if (item.noteRule === 'always') parts.push(t('admin.checklists.itemDetails.summaryAlways', 'Explanation: always'));
    if (item.noteRule === 'on_answers') {
      const labels = noteOptionsFor(item).filter((option) => item.noteAnswers?.includes(option.value)).map((option) => option.label).join(', ');
      parts.push(t('admin.checklists.itemDetails.summaryOnAnswers', 'Explanation: {{answers}}', { answers: labels }));
    }
    if (item.noteRule && item.noteRule !== 'off' && item.noteRequired) parts.push(t('admin.checklists.itemDetails.summaryRequired', 'required'));
    return parts.join(' · ');
  }
  function rowMenuContent() {
    const target = rowMenu.state?.target;
    if (!target) return { label: '', items: null };
    const rename = (id: string) => (
      <button disabled={!canEdit} onClick={() => focusNameField(id)} role="menuitem" type="button">{t('admin.checklists.rename.action', 'Rename')}</button>
    );
    if (target.kind === 'group') {
      const group = itemGroups.find((entry) => entry.id === target.id);
      if (!group) return { label: '', items: null };
      return {
        label: t('admin.checklists.contextMenu.rowLabel', 'Actions: {{name}}', { name: group.title }),
        items: (
          <>
            {rename(`group-title-${group.id}`)}
            <button disabled={!canEdit} onClick={() => void copyGroup(group.id)} role="menuitem" type="button">{t('admin.checklists.copyGroup', 'Copy')}</button>
            <button disabled={!canEdit} onClick={() => { setKeepItemsOnGroupDelete(false); setGroupToDelete(group); }} role="menuitem" type="button">{t('admin.checklists.delete', 'Delete')}</button>
          </>
        ),
      };
    }
    if (target.kind === 'item') {
      const item = items.find((entry) => entry.id === target.id);
      if (!item) return { label: '', items: null };
      return {
        label: t('admin.checklists.contextMenu.rowLabel', 'Actions: {{name}}', { name: item.text }),
        items: (
          <>
            {rename(`item-text-${item.id}`)}
            <button disabled={!canEdit} onClick={() => setDetailsItemId(item.id)} role="menuitem" type="button">{t('admin.checklists.itemDetails.action', 'Description and explanation…')}</button>
            <button disabled={!canEdit} onClick={() => void removeItem(item)} role="menuitem" type="button">{t('admin.checklists.delete', 'Delete')}</button>
          </>
        ),
      };
    }
    const field = contextFields.find((entry) => entry.id === target.id);
    if (!field) return { label: '', items: null };
    return {
      label: t('admin.checklists.contextMenu.rowLabel', 'Actions: {{name}}', { name: field.label || t('admin.checklists.contextFieldLabel', 'Field label') }),
      items: (
        <>
          {rename(`context-field-${field.id}`)}
          <button disabled={!canEdit} onClick={() => setContextFieldToDelete(field)} role="menuitem" type="button">{t('admin.checklists.delete', 'Delete')}</button>
        </>
      ),
    };
  }
  const rowMenuView = rowMenuContent();
  const previewItems = items.map((item) => ({ ...item, scale: scales.find((scale) => scale.id === item.scaleId) ?? item.scale }));
  return (
    <div className="admin-builder">
      <button type="button" className="admin-back-link" onClick={requestBack}>
        ← {t('admin.checklists.backToList', 'All checklists')}
      </button>
      {!canEdit && <p className="ui-state ui-state--warning admin-inline-banner" role="status">{t('admin.checklists.readOnlyNotice', 'Only the creator or an administrator can edit this checklist. You can view it.')}</p>}
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
              onClick={() => void openPreview()}
            >
              {t('admin.checklists.preview', 'Preview')}
            </Button>
            {canManageTemplates && (
              <Button type="button" variant="secondary" disabled={templateState === 'saving' || items.length === 0} onClick={() => void saveAsTemplate()}>
                {t('admin.checklists.templates.saveAs', 'Save as template')}
              </Button>
            )}
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
      {unsavedGuard && (
        <div className="ui-state ui-state--warning admin-inline-banner" role="status" data-testid="checklist-unsaved-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ marginRight: 'auto' }}>{t('admin.checklists.unsavedBar', 'There are unsaved changes')}</span>
          <Button type="button" variant="secondary" size="sm" disabled={saveState.status === 'saving'} onClick={discardChanges}>{t('admin.checklists.discardChanges', 'Discard')}</Button>
          <Button type="button" variant="primary" size="sm" disabled={saveState.status === 'saving'} onClick={() => void saveSettings('header')}>
            {saveState.status === 'saving' ? t('admin.checklists.saving', 'Saving...') : t('admin.checklists.save', 'Save')}
          </Button>
        </div>
      )}
      {headerError && <p className="learner-quiz__submit-error" role="alert">{headerError}</p>}
      {templateState === 'saved' && <p role="status" className="admin-form__hint">{t('admin.checklists.templates.saved', 'Saved as a template of the organization.')}</p>}
      {templateState === 'error' && <p role="alert" className="learner-quiz__submit-error">{t('admin.checklists.templates.saveError', 'Unable to save the template.')}</p>}
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
          <section className="admin-card admin-settings-block" aria-labelledby="checklist-settings-title">
            <h3 id="checklist-settings-title">{t('admin.checklists.settingsBlockTitle', 'Settings')}</h3>
            <ChecklistCheckboxOption
              label={t('admin.checklists.field.allowSkipAll', 'Add a “Skip” answer option')}
              hint={t('admin.checklists.allowSkipAllHint', 'The observer can skip any criterion. Skipped criteria are left out of the result. Applies to sessions assigned after you save.')}
              checked={allowSkipAll}
              disabled={!canEdit}
              onChange={setAllowSkipAll}
            />
            <ChecklistCheckboxOption
              label={t('admin.checklists.field.forbidGalleryPhotos', 'Photos only from the camera, not from the gallery')}
              hint={t('admin.checklists.forbidGalleryPhotosHint', 'The photo button opens the camera on phones. This is a convenience for the person filling in the checklist, not protection: the system cannot check where a photo was taken from. Applies to sessions assigned after you save.')}
              checked={forbidGalleryPhotos}
              disabled={!canEdit}
              onChange={setForbidGalleryPhotos}
            />
            <ChecklistCheckboxOption
              label={t('admin.checklists.field.recordLocation', 'Record location at the start and end of the observation')}
              hint={defaultLocationCapturePolicy === ''
                ? t('admin.checklists.recordLocationOrgDefault', 'Not set: the organization default applies when a session is scheduled.')
                : defaultLocationCapturePolicy === 'off'
                  ? t('admin.checklists.recordLocationOffHint', 'Location is not recorded for this checklist.')
                  : t('admin.checklists.defaultLocationCapturePolicyHint', 'Pre-fills the location capture policy when scheduling a session for this checklist.')}
              checked={defaultLocationCapturePolicy === 'optional' || defaultLocationCapturePolicy === 'required'}
              disabled={!canEdit}
              onChange={(on) => setDefaultLocationCapturePolicy(on ? 'optional' : 'off')}
            />
            {(defaultLocationCapturePolicy === 'optional' || defaultLocationCapturePolicy === 'required') && (
              <FormField id="checklist-default-location-policy" label={t('admin.checklists.field.defaultLocationCapturePolicy', 'Location requirement')}>
                <select id="checklist-default-location-policy" value={defaultLocationCapturePolicy} disabled={!canEdit} onChange={(e) => setDefaultLocationCapturePolicy(e.target.value as ChecklistGeolocationPolicy)}>
                  <option value="optional">{t('admin.checklists.sessions.wizard.locationOptional', 'Optional')}</option>
                  <option value="required">{t('admin.checklists.sessions.wizard.locationRequired', 'Required')}</option>
                </select>
              </FormField>
            )}
            <ChecklistCheckboxOption
              label={t('admin.checklists.field.feedbackEnabled', 'Add a “Feedback” section')}
              hint={t('admin.checklists.feedbackEnabledHint', 'The observer leaves strengths, development areas and a comment at the end of the session.')}
              checked={feedbackEnabled}
              disabled={!canEdit}
              onChange={(on) => { setFeedbackEnabled(on); if (!on) setFeedbackRequired(false); }}
            />
            {feedbackEnabled && !feedbackLayout && (
              <ChecklistCheckboxOption
                label={t('admin.checklists.field.feedbackRequired', 'Feedback is required')}
                hint={t('admin.checklists.feedbackRequiredHint', 'A session cannot be completed until strengths and development areas are filled in. Applies to sessions assigned after you save.')}
                checked={feedbackRequired}
                disabled={!canEdit}
                onChange={setFeedbackRequired}
              />
            )}
          </section>
          <ChecklistItemsEditor>
            <h3>{t('admin.checklists.contextFieldsTitle', 'General information')} <Badge variant="neutral">{contextFields.length}</Badge></h3>
            <p className="admin-form__hint">{t('admin.checklists.contextFieldsHint', 'Filled in by the observer before the criteria.')}</p>
            <div className="admin-context-fields">
              {contextFields.map((field) => (
                <div className="admin-context-field-row" key={field.id} {...rowMenu.triggerProps({ kind: 'field', id: field.id })}>
                  <label className="admin-context-field-row__field">
                    <span>{t('admin.checklists.contextFieldLabel', 'Field label')}</span>
                    <InlineNameField
                      id={`context-field-${field.id}`}
                      label={t('admin.checklists.contextFieldLabel', 'Field label')}
                      value={field.label}
                      maxLength={120}
                      disabled={!canEdit}
                      hintWhenEmpty
                      onCommit={async (label) => {
                        await persistContextFields(applyContextFieldPatch(contextFields, field.id, { label }));
                        updateContextFieldLocally(field.id, { label });
                      }}
                      t={t}
                    />
                  </label>
                  <label className="admin-context-field-row__field">
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
                  <label className="admin-checklist-item__photo admin-context-field-row__required">
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
                  <div className="admin-context-field-row__menu">
                  <Menu
                    align="end"
                    buttonClassName="admin-btn admin-btn--sm"
                    label={<><span aria-hidden="true">⋮</span><span className="ui-visually-hidden">{t('admin.checklists.contextFieldActions', 'Field actions: {{name}}', { name: field.label || t('admin.checklists.contextFieldLabel', 'Field label') })}</span></>}
                  >
                    <button disabled={!canEdit} onClick={() => focusNameField(`context-field-${field.id}`)} role="menuitem" type="button">
                      {t('admin.checklists.rename.action', 'Rename')}
                    </button>
                    <button onClick={() => setContextFieldToDelete(field)} role="menuitem" type="button">
                      {t('admin.checklists.delete', 'Delete')}
                    </button>
                  </Menu>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={() => {
              // PR 413: the new field is only added on the screen; it is saved with its name (an unnamed field is refused by the server).
              const next = appendContextField(contextFields);
              setContextFields(next);
              focusNameField(`context-field-${next.at(-1)!.id}`);
            }} type="button" variant="secondary" size="sm">
              + {t('admin.checklists.addContextField', 'Field')}
            </Button>
          </ChecklistItemsEditor>
          <ChecklistItemsEditor>
            <div className="admin-builder-section-head">
              <h3>{t('admin.checklists.groupsTitle', 'Groups and criteria')} <Badge variant="neutral">{items.length}</Badge></h3>
              <span className="admin-group-card__bulk">
                <Button type="button" variant="secondary" size="sm" disabled={!canEdit || items.length === 0 || items.every((entry) => !!entry.scaleId)} onClick={() => void setAllScalesEnabled(true)}>{t('admin.checklists.scaleSwitch.enableAll', 'Enable scale for all criteria')}</Button>
                <Button type="button" variant="secondary" size="sm" disabled={!canEdit || items.every((entry) => !entry.scaleId)} onClick={() => void setAllScalesEnabled(false)}>{t('admin.checklists.scaleSwitch.disableAll', 'Disable scale for all')}</Button>
              </span>
              <Button type="button" variant="primary" size="sm" onClick={() => void addGroup()}>
                + {t('admin.checklists.addGroup', 'Group')}
              </Button>
            </div>
            <DndContext {...layoutDnd.dndProps}>
            <SortableContext items={itemGroups.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
            {(layoutDnd.dragging ? layoutDnd.buckets : groupItems(items, itemGroups)).map(({ group, items: groupedItems }, groupIndex, allGroups) => {
              return (
              <GroupShell key={group?.id ?? 'ungrouped'} groupId={group?.id ?? null}>{(groupHandle) => (<>
                <div className="admin-group-card__head" {...(group ? rowMenu.triggerProps({ kind: 'group', id: group.id }) : {})}>
                  {group && groupHandle && <DragHandle handle={groupHandle} label={t('admin.checklists.dnd.dragGroup', 'Drag group: {{name}}', { name: group.title })} />}
                  <div className="admin-group-card__title">
                    {group ? (
                      <InlineNameField
                        id={`group-title-${group.id}`}
                        label={t('admin.checklists.groupTitle', 'Group title')}
                        value={group.title}
                        maxLength={120}
                        disabled={!canEdit}
                        validate={(name) => (itemGroups.some((other) => other.id !== group.id && other.title.trim().toLowerCase() === name.toLowerCase()) ? t('admin.checklists.rename.duplicateGroup', 'A group with this name already exists') : null)}
                        onCommit={(name) => persistGroupTitle(group.id, name)}
                        t={t}
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
                        <button className="admin-btn admin-btn--sm" disabled={!canEdit} onClick={() => focusNameField(`group-title-${group.id}`)} type="button" aria-label={t('admin.checklists.rename.namedGroup', 'Rename group: {{name}}', { name: group.title })}>{t('admin.checklists.rename.action', 'Rename')}</button>
                        <button className="admin-btn admin-btn--sm" onClick={() => void copyGroup(group.id)} type="button">{t('admin.checklists.copyGroup', 'Copy')}</button>
                        <button className="admin-btn admin-btn--sm" onClick={() => { setKeepItemsOnGroupDelete(false); setGroupToDelete(group); }} type="button" aria-label={t('admin.checklists.deleteNamedGroup', 'Delete group: {{name}}', { name: group.title })}>{t('admin.checklists.delete', 'Delete')}</button>
                      </>
                    )}
                    <button className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => void addCriterionToGroup(group?.id ?? null)} type="button">
                      + {t('admin.checklists.addCriterion', 'Criterion')}
                    </button>
                  </div>
                </div>
                {groupedItems.length > 0 && (
                  <div className={scoringMode === 'sum_points' ? 'admin-criteria-table' : 'admin-criteria-table admin-criteria-table--no-points'} role="table" aria-label={t('admin.checklists.groupsTitle', 'Groups and criteria')}>
                    <div className="admin-criteria-row admin-criteria-row--head" role="row">
                      <span className="admin-criteria-row__order" aria-hidden="true" />
                      <span className="admin-criteria-row__order" aria-hidden="true" />
                      <span>{t('admin.checklists.field.criterion', 'Criterion')}</span>
                      <span>{t('admin.checklists.field.scale', 'Scale')}</span>
                      {scoringMode === 'sum_points' && <span title={t('admin.checklists.scaleSwitch.pointsHint', 'Result = earned points / maximum; the checklist is passed at the pass threshold.')}>{t('admin.checklists.field.points', 'Points')}</span>}
                      <span title={t('admin.checklists.scaleSwitch.weightHint', 'Weight multiplies the points of the criterion and its maximum: weight 3 makes the criterion three times as important.')}>{t('admin.checklists.field.weight', 'Weight')}</span>
                      <span>{t('admin.checklists.criteriaTable.required', 'Required')}</span>
                      <span>{t('admin.checklists.criteriaTable.photo', 'Photo')}</span>
                      <span className="admin-criteria-row__menu" aria-hidden="true" />
                    </div>
                    <ItemsSortable ids={groupedItems.map((entry) => entry.id)}>
                    {groupedItems.map((item, itemIndex) => (
                      <SortableBox className="admin-criteria-row" id={item.id} key={item.id} role="row" extra={rowMenu.triggerProps({ kind: 'item', id: item.id })}>{(itemHandle) => (<>
                        <DragHandle handle={itemHandle} label={t('admin.checklists.dnd.dragCriterion', 'Drag criterion: {{name}}', { name: item.text })} />
                        <div className="admin-criteria-row__order">
                          <button disabled={itemIndex === 0} onClick={() => void moveItemDirection(item.id, 'up')} type="button" aria-label={t('admin.checklists.moveNamedUp', 'Move up: {{name}}', { name: item.text })}>↑</button>
                          <button disabled={itemIndex === groupedItems.length - 1} onClick={() => void moveItemDirection(item.id, 'down')} type="button" aria-label={t('admin.checklists.moveNamedDown', 'Move down: {{name}}', { name: item.text })}>↓</button>
                        </div>
                        <InlineNameField
                          id={`item-text-${item.id}`}
                          className="admin-criteria-row__text"
                          wrapperClassName="admin-criteria-row__name"
                          multiline
                          label={t('admin.checklists.field.criterion', 'Criterion')}
                          value={item.text}
                          maxLength={500}
                          disabled={!canEdit}
                          onCommit={(text) => persistItem(item.id, { text })}
                          t={t}
                        />
                        <div className="admin-criteria-cell admin-criteria-cell--scale">
                          <label className="admin-criteria-scale-switch">
                            <input
                              className="admin-switch"
                              type="checkbox"
                              role="switch"
                              checked={!!item.scaleId}
                              disabled={!canEdit}
                              onChange={(e) => void setItemScaleEnabled(item, e.target.checked)}
                              aria-label={t('admin.checklists.scaleSwitch.label', 'Scale: {{name}}', { name: item.text })}
                            />
                            <span aria-hidden="true">{t('admin.checklists.field.scale', 'Scale')}</span>
                          </label>
                          {item.scaleId && (
                            <select
                              className="admin-criteria-row__scale"
                              value={item.scaleId}
                              disabled={!canEdit}
                              onChange={(e) => {
                                if (e.target.value === CREATE_SCALE_OPTION) {
                                  setScaleCreateForItemId(item.id);
                                  return;
                                }
                                void persistItem(item.id, { scaleId: e.target.value });
                              }}
                              title={describeScaleLevels(scales.find((s) => s.id === item.scaleId)?.levels ?? [])}
                              aria-label={t('admin.checklists.scaleSwitch.choose', 'Scale of the criterion: {{name}}', { name: item.text })}
                            >
                              <option value={CREATE_SCALE_OPTION}>+ {t('admin.checklists.scaleManager.createOption', 'Create scale')}</option>
                              {scales.filter((s) => s.status === 'active' || s.id === item.scaleId).map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        {scoringMode === 'sum_points' && item.scaleId && (
                          <div className="admin-criteria-cell admin-criteria-cell--points-from-scale" title={t('admin.checklists.scaleSwitch.pointsFromScale', 'Points come from the levels of the scale')}>
                            <span aria-hidden="true">{t('admin.checklists.field.points', 'Points')}</span>
                            <span>{t('admin.checklists.scaleSwitch.fromScale', 'from scale')}</span>
                          </div>
                        )}
                        {scoringMode === 'sum_points' && !item.scaleId && (
                          <div className="admin-criteria-cell">
                            <span aria-hidden="true">{t('admin.checklists.field.points', 'Points')}</span>
                            <input
                              type="number"
                              className="admin-criteria-row__points"
                              value={item.points}
                              onChange={(e) => updateItemLocally(item.id, { points: Number(e.target.value) })}
                              onBlur={(e) => void persistItem(item.id, { points: Number(e.target.value) })}
                              aria-label={t('admin.checklists.field.points', 'Points')}
                            />
                          </div>
                        )}
                        <div className="admin-criteria-cell">
                          <span aria-hidden="true">{t('admin.checklists.field.weight', 'Weight')}</span>
                          <input
                            type="number"
                            className="admin-criteria-row__weight"
                            min={1}
                            value={item.weight ?? 1}
                            onChange={(e) => updateItemLocally(item.id, { weight: Number(e.target.value) })}
                            onBlur={(e) => void persistItem(item.id, { weight: Number(e.target.value) })}
                            aria-label={t('admin.checklists.field.weight', 'Weight')}
                            title={t('admin.checklists.scaleSwitch.weightHint', 'Weight multiplies the points of the criterion and its maximum: weight 3 makes the criterion three times as important.')}
                          />
                        </div>
                        <label className="admin-criteria-cell">
                          <span aria-hidden="true">{t('admin.checklists.criteriaTable.required', 'Required')}</span>
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
                        </label>
                        <label className="admin-criteria-cell">
                          <span aria-hidden="true">{t('admin.checklists.criteriaTable.photo', 'Photo')}</span>
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
                        </label>
                        <Menu
                          align="end"
                          buttonClassName="admin-btn admin-btn--sm"
                          className="admin-criteria-row__menu"
                          label={<><span aria-hidden="true">⋮</span><span className="ui-visually-hidden">{t('admin.checklists.rowActions', 'Actions')}</span></>}
                        >
                          <button disabled={!canEdit} onClick={() => focusNameField(`item-text-${item.id}`)} role="menuitem" type="button">
                            {t('admin.checklists.rename.action', 'Rename')}
                          </button>
                          <button disabled={!canEdit} onClick={() => setDetailsItemId(item.id)} role="menuitem" type="button">
                            {t('admin.checklists.itemDetails.action', 'Description and explanation…')}
                          </button>
                          <button onClick={() => void removeItem(item)} role="menuitem" type="button">
                            {t('admin.checklists.delete', 'Delete')}
                          </button>
                        </Menu>
                        {describeItemDetails(item) && <p className="admin-criteria-row__meta">{describeItemDetails(item)}</p>}
                      </>)}</SortableBox>
                    ))}
                    </ItemsSortable>
                  </div>
                )}
                {groupedItems.length === 0 && <EmptyState message={t('admin.checklists.noItems', 'No items yet.')} />}
              </>)}</GroupShell>
              );
            })}
            </SortableContext>
            </DndContext>
          </ChecklistItemsEditor>
          {feedbackEnabled && <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, minWidth: 0 }}><legend className="ui-visually-hidden">{t('admin.checklists.feedbackSectionTitle')}</legend><FeedbackBuilder value={feedbackLayout} onChange={setFeedbackLayout} required={feedbackRequired} /></fieldset>}
        </div>
        <div className="admin-builder__column">
          <ChecklistSettingsForm>
            <h3 className="admin-heading-tip">
              {t('admin.checklists.scoringTitle', 'Scoring')}
              <ChecklistHelpTip name={scoringModeLabels[scoringMode]}>{t(`admin.checklists.scoringModeInfo.${scoringMode}`, scoringMode)}</ChecklistHelpTip>
            </h3>
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
                <p className="admin-form__hint">{t('admin.checklists.scaleLevelsCriterionHint', 'A criterion can also use its own ready-made scale, chosen in the criteria table; without one, the levels above apply.')}</p>
              </div>
            )}
            {scoringMode === 'none' ? (
              <p className="admin-form__hint">{t('admin.checklists.scoring.noneHint', 'Without points: the check is only completed. No percentage, pass threshold or “passed / not passed” is shown.')}</p>
            ) : (
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
            )}
            {scoringMode !== checklist.scoringMode && (checklist.status !== 'draft') && (
              <p className="admin-form__hint" role="note">{t('admin.checklists.scoring.changeNote', 'The new mode will not affect checks that are already assigned: they keep the mode they were assigned with.')}</p>
            )}
            <FormField id="checklist-access-mode" label={t('admin.checklists.field.accessMode', 'How the checklist is taken')} hint={t(`admin.checklists.accessModeHint.${accessMode}`, accessMode)}>
              {canSwitchAccessMode ? (
                <select
                  id="checklist-access-mode"
                  value={accessMode}
                  onChange={(e) => setAccessMode(e.target.value as ChecklistAccessMode)}
                >
                  <option value="assigned">{t('admin.checklists.accessMode.assigned', 'By assignment')}</option>
                  <option value="free">{t('admin.checklists.accessMode.free', 'Free access')}</option>
                </select>
              ) : (
                <>
                  <output id="checklist-access-mode">{t(`admin.checklists.accessMode.${accessMode}`, accessMode)}</output>
                  <small className="admin-form__hint">{t('admin.checklists.accessMode.adminOnly', 'Only an administrator can change this.')}</small>
                </>
              )}
            </FormField>
            {accessMode === 'free' && (
              <ChecklistCheckboxOption
                label={t('admin.checklists.field.pinned', 'Pin to the dashboard')}
                hint={checklist.status === 'published'
                  ? t('admin.checklists.pinnedHint', 'Shows the checklist as a tile at the top of the learner pages. Up to 8 checklists can be pinned.')
                  : t('admin.checklists.pinnedDraftHint', 'Available once the checklist is published.')}
                checked={pinned}
                disabled={checklist.status !== 'published'}
                onChange={setPinned}
              />
            )}
            <details>
              <summary>{t('admin.checklists.advancedTitle', 'Additional settings')}</summary>
            <ChecklistCheckboxOption
              label={t('admin.checklists.field.requiresReview', 'Require an instructor to confirm the result before it counts')}
              hint={t('admin.checklists.requiresReviewHint', 'When enabled, learner submissions are computed automatically but stay pending until an instructor or manager approves each item.')}
              checked={requiresReview}
              onChange={setRequiresReview}
            />
            {canManageEditAccess && (
              <ChecklistCheckboxOption
                label={t('admin.checklists.field.allowEditByAll', 'Allow everyone to edit this checklist')}
                hint={t('admin.checklists.allowEditByAllHint', 'When off, only you and administrators can edit this checklist. Other employees can still view it and assign it.')}
                checked={allowEditByAll}
                onChange={setAllowEditByAll}
              />
            )}
            <ChecklistCheckboxOption
              label={t('admin.checklists.field.allowFinishIncomplete', 'Allow finishing a session with unanswered criteria')}
              hint={t('admin.checklists.allowFinishIncompleteHint', 'The observer can complete the session without answering every criterion. Unanswered criteria are recorded as skipped and are not counted in the result. Applies to sessions assigned after you save.')}
              checked={allowFinishIncomplete}
              onChange={setAllowFinishIncomplete}
            />
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
            <ChecklistModuleSettingsBlock
              canEditObservers={canSwitchAccessMode}
              withoutPoints={scoringMode === 'none'}
              disabled={!canEdit}
              locationPolicy={defaultLocationCapturePolicy}
              onChange={setModuleSettings}
              onResetLocation={() => setDefaultLocationCapturePolicy('')}
              t={t}
              value={moduleSettings}
            />
            {saveState.status === 'error' && <p className="learner-quiz__submit-error" role="alert">{saveState.message}</p>}
            <p role="status" className="admin-form__hint">
              {hasUnsavedChanges
                ? t('admin.checklists.unsavedChanges', 'There are unsaved changes.')
                : t('admin.checklists.allSaved', 'All changes are saved.')}
            </p>
            <Button type="button" variant="primary" disabled={saveState.status === 'saving' || !canEdit} onClick={() => void saveSettings()}>
              {saveState.status === 'saving' ? t('admin.checklists.saving', 'Saving...') : t('admin.checklists.save', 'Save')}
            </Button>
          </ChecklistSettingsForm>
        </div>
      </div>
      <ConfirmDialog
        open={leave !== null}
        title={t('admin.checklists.leave.title', 'Unsaved changes')}
        message={t('admin.checklists.leave.message', 'The checklist settings have unsaved changes. Save them before leaving?')}
        confirmLabel={t('admin.checklists.leave.save', 'Save')}
        secondaryLabel={t('admin.checklists.leave.discard', 'Don’t save')}
        cancelLabel={t('admin.checklists.leave.stay', 'Stay')}
        onCancel={() => setLeave(null)}
        onSecondary={() => { const target = leave; setLeave(null); if (target) { bypassLeaveGuard.current = true; target.proceed(); bypassLeaveGuard.current = false; } }}
        onConfirm={() => {
          const target = leave;
          setLeave(null);
          void saveSettings('header').then((ok) => { if (ok && target) target.proceed(); });
        }}
      />
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
      <RichConfirmDialog
        open={groupToDelete !== null}
        title={t('admin.checklists.groupDeleteTitle', 'Delete group')}
        message={(() => {
          const count = items.filter((item) => item.groupId === groupToDelete?.id).length;
          return (
            <>
              <p>{count > 0
                ? t('admin.checklists.groupDeleteConfirm', 'Delete the group "{{name}}" and {{count}} criteria?', { name: groupToDelete?.title ?? '', count })
                : t('admin.checklists.groupDeleteConfirmEmpty', 'Delete the empty group "{{name}}"?', { name: groupToDelete?.title ?? '' })}</p>
              {count > 0 && (
                <label>
                  <input checked={keepItemsOnGroupDelete} onChange={(e) => setKeepItemsOnGroupDelete(e.target.checked)} type="checkbox" />
                  {' '}{t('admin.checklists.groupDeleteKeepItems', 'Delete only the group, keep the criteria without a group')}
                </label>
              )}
            </>
          );
        })()}
        confirmLabel={t('admin.checklists.delete', 'Delete')}
        cancelLabel={t('admin.checklists.cancel', 'Cancel')}
        danger
        onConfirm={() => {
          const target = groupToDelete;
          setGroupToDelete(null);
          if (target) void confirmDeleteGroup(target, keepItemsOnGroupDelete);
        }}
        onCancel={() => setGroupToDelete(null)}
      />
      {previewOpen && (
        <ChecklistPreviewDialog
          title={title || checklist.title}
          description={description}
          items={previewItems}
          groups={itemGroups}
          contextFields={contextFields}
          scoringMode={scoringMode}
          scaleLevels={scaleLevels}
          passThreshold={passThreshold}
          feedbackLayout={feedbackLayout}
          feedbackEnabled={feedbackEnabled}
          feedbackRequired={feedbackRequired}
          allowSkipAll={allowSkipAll}
          cameraOnly={forbidGalleryPhotos}
          onClose={() => setPreviewOpen(false)}
          t={t}
        />
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
      {detailsItemId && (() => {
        const target = items.find((entry) => entry.id === detailsItemId);
        return target ? (
          <ItemDetailsDialog
            key={target.id}
            item={target}
            onClose={() => setDetailsItemId(null)}
            onSave={async (patch) => { await persistItem(target.id, patch); }}
            open
            options={noteOptionsFor(target)}
            t={t}
          />
        ) : null;
      })()}
      <ContextMenu label={rowMenuView.label} onClose={rowMenu.close} state={rowMenu.state}>{rowMenuView.items}</ContextMenu>
    </div>
  );
}
