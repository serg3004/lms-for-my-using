import { useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import { archiveChecklistScale, copyChecklistScale, createChecklistScale, deleteChecklistScale, listChecklistScales, updateChecklistScale } from '../../shared/api/checklists.js';
import type { ChecklistScaleSummary } from '../../shared/api/types.js';
import { ConfirmDialog } from '../../shared/adminPage.js';
import { HighlightColorField } from '../../shared/HighlightColorField.js';
import { Button, Dialog, Input } from '../../shared/ui.js';
import {
  SCALE_MAX_LEVELS,
  SCALE_MIN_LEVELS,
  createScaleLevelDraft,
  moveScaleLevelDraft,
  newScaleLevelDrafts,
  scaleDraftToInput,
  scaleLevelDraftsFromLevels,
  validateScaleDraft,
  SCALE_LEVEL_COLORS,
  type ScaleDraftError,
  type ScaleLevelDraft,
} from './domain.js';

const SCALE_NAME_MAX = 255;

type EditorState = {
  /** null while creating a new scale. */
  scaleId: string | null;
  /** The scale is archived or the default one: shown read-only, "Make a copy" is the way to change it. */
  readOnly: boolean;
  isDefault: boolean;
  /** PR 369: used by assigned checklists -- still editable, with a warning. */
  inUse: boolean;
  name: string;
  levels: ScaleLevelDraft[];
};

function newEditor(): EditorState {
  return { scaleId: null, readOnly: false, isDefault: false, inUse: false, name: '', levels: newScaleLevelDrafts() };
}

function editorFor(scale: ChecklistScaleSummary): EditorState {
  return { scaleId: scale.id, readOnly: scale.isDefault || scale.status === 'archived', isDefault: scale.isDefault, inUse: scale.inUse, name: scale.name, levels: scaleLevelDraftsFromLevels(scale.levels) };
}

function draftErrorText(error: ScaleDraftError, t: TFunction) {
  switch (error) {
    case 'name':
      return t('admin.checklists.scaleManager.errorName', 'Enter a scale name.');
    case 'tooFewLevels':
      return t('admin.checklists.scaleManager.errorMinLevels', 'A scale needs at least {{count}} levels.', { count: SCALE_MIN_LEVELS });
    case 'tooManyLevels':
      return t('admin.checklists.scaleManager.errorMaxLevels', 'A scale can have at most {{count}} levels.', { count: SCALE_MAX_LEVELS });
    case 'label':
      return t('admin.checklists.scaleManager.errorLabel', 'Every level needs a name.');
    case 'score':
      return t('admin.checklists.scaleManager.errorScore', 'Points must be a whole number from 0 to 1000.');
    case 'color':
      return t('admin.checklists.scaleManager.errorColor', 'Every level colour must be a code like #2E7D32.');
  }
}

/**
 * "Оценочные шкалы" -- a secondary/contextual dialog reached from the builder (not a top-level
 * nav item): a list of scales with archive and (unused scales only) delete, and (PR 343) a full
 * editor for the name and the levels (name + points each). A scale used by assigned checklists
 * stays editable (PR 369, with a warning); the default and archived scales are read-only and offer
 * "Make a copy" instead.
 * `startCreating` opens the editor for a new scale straight away (the builder's "Create scale"
 * option); `onSaved` hands the saved scale back to the caller.
 */
export function ScaleManagerDialog({ open, onClose, onChanged, onSaved, startCreating = false, t }: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  onSaved?: (scale: ChecklistScaleSummary) => void;
  startCreating?: boolean;
  t: TFunction;
}) {
  const titleId = useId();
  const [scales, setScales] = useState<ChecklistScaleSummary[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [scaleToDelete, setScaleToDelete] = useState<ChecklistScaleSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setEditor(startCreating ? newEditor() : null);
    listChecklistScales().then(setScales).catch(() => setScales([]));
  }, [open, startCreating]);

  async function reload() {
    const result = await listChecklistScales().catch(() => scales);
    setScales(result);
  }

  function failure(e: unknown) {
    setError(e instanceof ApiClientError ? e.message : t('admin.checklists.scaleManager.error', 'Unable to save the scale.'));
  }

  async function saveEditor() {
    if (!editor || editor.readOnly) return;
    const invalid = validateScaleDraft(editor.name, editor.levels);
    if (invalid) {
      setError(draftErrorText(invalid, t));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const input = scaleDraftToInput(editor.name, editor.levels);
      const saved = editor.scaleId ? await updateChecklistScale(editor.scaleId, input) : await createChecklistScale(input);
      setEditor(null);
      await reload();
      onChanged();
      onSaved?.(saved);
    } catch (e) {
      failure(e);
    } finally {
      setSaving(false);
    }
  }

  async function makeCopy() {
    if (!editor?.scaleId) return;
    setError(null);
    setSaving(true);
    try {
      const copy = await copyChecklistScale(editor.scaleId, t('admin.checklists.scaleManager.copyName', '{{name}} (copy)', { name: editor.name }));
      setEditor(editorFor(copy));
      await reload();
      onChanged();
    } catch (e) {
      failure(e);
    } finally {
      setSaving(false);
    }
  }

  async function removeScale(scale: ChecklistScaleSummary) {
    setError(null);
    try {
      await deleteChecklistScale(scale.id);
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError && e.status === 409
        ? t('admin.checklists.scaleManager.inUse', 'This scale is used by checklist criteria and cannot be deleted. Archive it instead.')
        : e instanceof ApiClientError ? e.message : t('admin.checklists.scaleManager.error', 'Unable to save the scale.'));
    }
  }

  async function archiveScale(scaleId: string) {
    setError(null);
    try {
      await archiveChecklistScale(scaleId);
      await reload();
      onChanged();
    } catch (e) {
      failure(e);
    }
  }

  function patchLevel(key: string, patch: Partial<ScaleLevelDraft>) {
    setEditor((current) => current && { ...current, levels: current.levels.map((level) => (level.key === key ? { ...level, ...patch } : level)) });
  }

  if (editor) {
    return (
      <Dialog labelledBy={titleId} onClose={onClose} open={open}>
        <h2 id={titleId}>
          {editor.scaleId === null
            ? t('admin.checklists.scaleManager.newTitle', 'New scale')
            : t('admin.checklists.scaleManager.editTitle', 'Edit scale')}
        </h2>
        {editor.readOnly && (
          <p className="admin-form__hint" role="note">
            {editor.isDefault
              ? t('admin.checklists.scaleManager.defaultNote', 'This is the default scale and cannot be changed. Make a copy and edit the copy.')
              : t('admin.checklists.scaleManager.readOnlyNote', 'This scale is archived and cannot be changed. Make a copy and edit the copy.')}
          </p>
        )}
        {editor.inUse && !editor.readOnly && (
          <p className="admin-form__hint" role="note">
            {t('admin.checklists.scaleManager.usedWarning', 'This scale is already used in observation sheets. The updated scale will be used for sessions that have not started yet; the rest stay unchanged.')}
          </p>
        )}
        {error && <p className="learner-quiz__submit-error" role="alert">{error}</p>}
        <Input
          disabled={editor.readOnly}
          label={t('admin.checklists.scaleManager.name', 'Scale name')}
          maxLength={SCALE_NAME_MAX}
          onChange={(e) => setEditor({ ...editor, name: e.target.value })}
          value={editor.name}
        />
        <p aria-live="off" className="admin-form__hint">{editor.name.length}/{SCALE_NAME_MAX}</p>
        <h3>{t('admin.checklists.scaleManager.levels', 'Levels')}</h3>
        <ol className="admin-checklist-instances">
          {editor.levels.map((level, index) => {
            const n = index + 1;
            return (
              <li key={level.key} style={{ flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <Input
                    aria-label={t('admin.checklists.scaleManager.levelName', 'Level {{n}} name', { n })}
                    disabled={editor.readOnly}
                    maxLength={80}
                    onChange={(e) => patchLevel(level.key, { label: e.target.value })}
                    value={level.label}
                  />
                </div>
                <Input
                  aria-label={t('admin.checklists.scaleManager.levelScore', 'Level {{n}} points', { n })}
                  disabled={editor.readOnly}
                  inputMode="numeric"
                  onChange={(e) => patchLevel(level.key, { score: e.target.value })}
                  value={level.score}
                />
                <HighlightColorField
                  disabled={editor.readOnly}
                  label={t('admin.checklists.scaleManager.levelColor', 'Level {{n}} colour', { n })}
                  onChange={(color) => patchLevel(level.key, { color })}
                  value={level.color}
                />
                {!editor.readOnly && (
                  <>
                    <Button
                      aria-label={t('admin.checklists.scaleManager.moveLevelUp', 'Move level {{n}} up', { n })}
                      disabled={index === 0}
                      onClick={() => setEditor({ ...editor, levels: moveScaleLevelDraft(editor.levels, index, 'up') })}
                      type="button"
                      variant="secondary"
                    >
                      ↑
                    </Button>
                    <Button
                      aria-label={t('admin.checklists.scaleManager.moveLevelDown', 'Move level {{n}} down', { n })}
                      disabled={index === editor.levels.length - 1}
                      onClick={() => setEditor({ ...editor, levels: moveScaleLevelDraft(editor.levels, index, 'down') })}
                      type="button"
                      variant="secondary"
                    >
                      ↓
                    </Button>
                    <Button
                      aria-label={t('admin.checklists.scaleManager.removeLevel', 'Remove level {{n}}', { n })}
                      disabled={editor.levels.length <= SCALE_MIN_LEVELS}
                      onClick={() => setEditor({ ...editor, levels: editor.levels.filter((l) => l.key !== level.key) })}
                      type="button"
                      variant="secondary"
                    >
                      ✕
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ol>
        {!editor.readOnly && (
          <Button
            disabled={editor.levels.length >= SCALE_MAX_LEVELS}
            onClick={() => setEditor({ ...editor, levels: [...editor.levels, createScaleLevelDraft()] })}
            type="button"
            variant="secondary"
          >
            + {t('admin.checklists.scaleManager.addLevel', 'Add level')}
          </Button>
        )}
        <p className="admin-form__hint">
          {t('admin.checklists.scaleManager.appliesToNew', 'Changes apply to new and not yet started sessions; sessions already started keep their own copy.')}
        </p>
        <div className="ds-dialog__actions">
          <Button disabled={saving} onClick={() => { setError(null); if (startCreating && editor.scaleId === null) onClose(); else setEditor(null); }} type="button" variant="secondary">
            {t('admin.checklists.cancel', 'Cancel')}
          </Button>
          {editor.readOnly && editor.scaleId && (
            <Button disabled={saving} onClick={() => void makeCopy()} type="button" variant="primary">
              {t('admin.checklists.scaleManager.makeCopy', 'Make a copy')}
            </Button>
          )}
          {!editor.readOnly && (
            <Button disabled={saving} onClick={() => void saveEditor()} type="button" variant="primary">
              {editor.scaleId === null ? t('admin.checklists.scaleManager.create', 'Create') : t('admin.checklists.save', 'Save')}
            </Button>
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} open={open}>
      <h2 id={titleId}>{t('admin.checklists.scaleManager.title', 'Evaluation scales')}</h2>
      {error && <p className="learner-quiz__submit-error" role="alert">{error}</p>}
      <ul className="admin-checklist-instances">
        {scales.map((scale) => (
          <li key={scale.id}>
            <div>
              <b>{scale.name}</b>
              <span className="admin-form__hint">
                {' '}{t('admin.checklists.scaleManager.levelsCount', '{{count}} levels', { count: scale.levels.length })}
                {scale.levels.map((level) => (
                  <span aria-hidden="true" key={level.value} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginLeft: 4, background: level.color ?? SCALE_LEVEL_COLORS.partial }} />
                ))}
                {scale.isDefault ? ` · 🔒 ${t('admin.checklists.scaleManager.defaultBadge', 'Default')}` : ''}
                {scale.inUse ? ` · ${t('admin.checklists.scaleManager.usedBadge', 'In use')}` : ''}
                {scale.status === 'archived' ? ` · ${t('admin.checklists.scaleManager.archived', 'Archived')}` : ''}
              </span>
            </div>
            <Button aria-label={`${scale.isDefault || scale.status === 'archived' ? t('admin.checklists.scaleManager.view', 'View') : t('admin.checklists.scaleManager.edit', 'Edit')}: ${scale.name}`} onClick={() => setEditor(editorFor(scale))} type="button" variant="secondary">
              {scale.isDefault || scale.status === 'archived' ? t('admin.checklists.scaleManager.view', 'View') : t('admin.checklists.scaleManager.edit', 'Edit')}
            </Button>
            {!scale.isDefault && scale.status !== 'archived' && (
              <Button onClick={() => void archiveScale(scale.id)} type="button" variant="secondary">
                {t('admin.checklists.scaleManager.archive', 'Archive')}
              </Button>
            )}
            {!scale.isDefault && (
              <Button onClick={() => setScaleToDelete(scale)} type="button" variant="secondary">
                {t('admin.checklists.scaleManager.delete', 'Delete')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {scales.length === 0 && <p className="admin-form__hint">{t('admin.checklists.scaleManager.empty', 'No evaluation scales yet.')}</p>}
      <div className="ds-dialog__actions">
        <Button onClick={onClose} type="button" variant="secondary">{t('admin.checklists.close', 'Close')}</Button>
        <Button onClick={() => setEditor(newEditor())} type="button" variant="primary">+ {t('admin.checklists.scaleManager.addScale', 'New scale')}</Button>
      </div>
      <ConfirmDialog
        open={scaleToDelete !== null}
        title={t('admin.checklists.scaleManager.deleteTitle', 'Delete scale')}
        message={t('admin.checklists.scaleManager.deleteConfirm', 'Delete the scale "{{name}}"? This cannot be undone. If the scale is used by checklist criteria the deletion is rejected; archive it instead.', { name: scaleToDelete?.name ?? '' })}
        confirmLabel={t('admin.checklists.scaleManager.delete', 'Delete')}
        cancelLabel={t('admin.checklists.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => {
          const target = scaleToDelete;
          setScaleToDelete(null);
          if (target) void removeScale(target);
        }}
        onCancel={() => setScaleToDelete(null)}
      />
    </Dialog>
  );
}
