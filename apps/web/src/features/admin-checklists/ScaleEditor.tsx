import type { TFunction } from 'i18next';
import { HighlightColorField } from '../../shared/HighlightColorField.js';
import { Button, Input } from '../../shared/ui.js';
import type { ChecklistScaleSummary } from '../../shared/api/types.js';
import { SCALE_MAX_LEVELS, SCALE_MIN_LEVELS, createScaleLevelDraft, moveScaleLevelDraft, newScaleLevelDrafts, scaleLevelDraftsFromLevels, type ScaleDraftError, type ScaleLevelDraft } from './domain.js';

const SCALE_NAME_MAX = 255;

export type ScaleEditorState = {
  /** null while creating a new scale. */
  scaleId: string | null;
  /** The scale is archived or the default one: shown read-only, "Make a copy" is the way to change it. */
  readOnly: boolean;
  isDefault: boolean;
  viewOnly?: boolean;
  /** PR 369: used by assigned checklists -- still editable, with a warning. */
  inUse: boolean;
  name: string;
  levels: ScaleLevelDraft[];
};

export function newScaleEditor(): ScaleEditorState {
  return { scaleId: null, readOnly: false, isDefault: false, inUse: false, name: '', levels: newScaleLevelDrafts() };
}

export function scaleEditorFor(scale: ChecklistScaleSummary): ScaleEditorState {
  return { scaleId: scale.id, readOnly: scale.isDefault || scale.status === 'archived', isDefault: scale.isDefault, inUse: scale.inUse, name: scale.name, levels: scaleLevelDraftsFromLevels(scale.levels) };
}

export function scaleDraftErrorText(error: ScaleDraftError, t: TFunction) {
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


/** One form for the standalone library and the existing builder dialog. */
export function ScaleEditor({ editor, onChange, error, t }: { editor: ScaleEditorState; onChange: (value: ScaleEditorState) => void; error?: string | null; t: TFunction }) {
  function patchLevel(key: string, patch: Partial<ScaleLevelDraft>) {
    onChange({ ...editor, levels: editor.levels.map((level) => level.key === key ? { ...level, ...patch } : level) });
  }
  return <>
        {editor.readOnly && (
          <p className="admin-form__hint" role="note">
            {editor.isDefault
              ? t('admin.checklists.scaleManager.defaultNote', 'This is the default scale and cannot be changed. Make a copy and edit the copy.')
              : editor.viewOnly ? t('admin.checklists.scaleLibrary.readOnly') : t('admin.checklists.scaleManager.readOnlyNote', 'This scale is archived and cannot be changed. Make a copy and edit the copy.')}
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
          onChange={(e) => onChange({ ...editor, name: e.target.value })}
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
                      onClick={() => onChange({ ...editor, levels: moveScaleLevelDraft(editor.levels, index, 'up') })}
                      type="button"
                      variant="secondary"
                    >
                      ↑
                    </Button>
                    <Button
                      aria-label={t('admin.checklists.scaleManager.moveLevelDown', 'Move level {{n}} down', { n })}
                      disabled={index === editor.levels.length - 1}
                      onClick={() => onChange({ ...editor, levels: moveScaleLevelDraft(editor.levels, index, 'down') })}
                      type="button"
                      variant="secondary"
                    >
                      ↓
                    </Button>
                    <Button
                      aria-label={t('admin.checklists.scaleManager.removeLevel', 'Remove level {{n}}', { n })}
                      disabled={editor.levels.length <= SCALE_MIN_LEVELS}
                      onClick={() => onChange({ ...editor, levels: editor.levels.filter((l) => l.key !== level.key) })}
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
            onClick={() => onChange({ ...editor, levels: [...editor.levels, createScaleLevelDraft()] })}
            type="button"
            variant="secondary"
          >
            + {t('admin.checklists.scaleManager.addLevel', 'Add level')}
          </Button>
        )}
        <p className="admin-form__hint">
          {t('admin.checklists.scaleManager.appliesToNew', 'Changes apply to new and not yet started sessions; sessions already started keep their own copy.')}
        </p>
  </>;
}
