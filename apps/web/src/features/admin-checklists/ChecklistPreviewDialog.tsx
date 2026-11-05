import { checklistLabel, checklistNumbers } from '@lms/shared/checklist-numbering';
import { RichDescription } from '../../shared/RichDescription.js';
import { collectFeedbackFields, isCustomFeedback, firstMissingRequiredFeedback, type FeedbackLayout, type FeedbackAnswerSetSnapshot } from '@lms/shared/checklist-feedback';
import { listChecklistAnswerSets } from '../../shared/api/checklists.js';
import { useEffect, useId, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { ContextFields, CriterionHeading, FeedbackFields, type FeedbackDraft } from '../../app/ChecklistConductFields.js';
import { checklistItemLevels } from '../../app/checklistCompletion.js';
import { ChecklistItemDescription, ChecklistNoteField } from '../../app/ChecklistItemNote.js';
import { isNoteOffered, isNoteRequired } from '../../app/checklistItemNote.js';
import type { ChecklistItemGroup, ChecklistItemSummary, ChecklistPhotoSummary, ChecklistScaleLevel, ChecklistScoringMode, ContextField } from '../../shared/api/types.js';
import { CHECKLIST_PHOTO_ACCEPT, checklistPhotoErrorMessage, validateChecklistPhoto } from '../../shared/checklistPhoto.js';
import { ChecklistPhotoStrip } from '../../shared/ChecklistPhotoStrip.js';
import { Button } from '../../shared/ui.js';
import { computePreviewResult, groupItems, type PreviewAnswer } from './domain.js';

type PreviewProps = {
  title: string; description: string; items: ChecklistItemSummary[]; groups: ChecklistItemGroup[];
  // PR 421: the sheet's extra pictures, shown under the description like the employee sees them.
  checklistId?: string; photos?: ChecklistPhotoSummary[];
  contextFields: ContextField[]; scoringMode: ChecklistScoringMode; scaleLevels: ChecklistScaleLevel[];
  showNumbering?: boolean; passThreshold: number; feedbackEnabled: boolean; feedbackRequired: boolean; allowSkipAll: boolean;
  feedbackLayout?: FeedbackLayout | null;
  cameraOnly: boolean; onClose: () => void; t: TFunction;
};

const emptyFeedback: FeedbackDraft = { strengths: '', developmentAreas: '', nextSteps: '' };

/** Local draft only: this component never loads a session or invokes a mutation/upload. */
export function ChecklistPreviewDialog(props: PreviewProps) {
  const { title, description, items, groups, showNumbering = true, contextFields, scoringMode, scaleLevels, passThreshold, feedbackEnabled, feedbackRequired, allowSkipAll, cameraOnly, onClose, t } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const hintId = useId();
  const [answers, setAnswers] = useState<Record<string, PreviewAnswer>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<FeedbackDraft>(emptyFeedback);
  const [answerSets, setAnswerSets] = useState<Record<string, FeedbackAnswerSetSnapshot>>({});
  useEffect(() => { if (!props.feedbackLayout || !collectFeedbackFields(props.feedbackLayout).some((field) => field.kind === 'choice')) return; let active = true; void listChecklistAnswerSets().then((sets) => { if (active && Array.isArray(sets)) setAnswerSets(Object.fromEntries(sets.map((set) => [set.id, set]))); }).catch(() => {}); return () => { active = false; }; }, [props.feedbackLayout]);
  const config = props.feedbackLayout ? { layout: props.feedbackLayout, answerSets } : null;
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => {
    const returnFocus = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    closeButton.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      returnFocus?.focus();
    };
  }, []);

  const numbering = checklistNumbers(items, groups);
  const result = computePreviewResult(items, scoringMode, scaleLevels, passThreshold, answers, allowSkipAll, true);
  const complete = result.allAnswered && contextFields.every((field) => !field.required || values[field.id]?.trim())
    && (!feedbackEnabled || (isCustomFeedback(props.feedbackLayout) ? !firstMissingRequiredFeedback(props.feedbackLayout!, feedback.answers ?? {}) : !feedbackRequired || Boolean(feedback.strengths.trim() && feedback.developmentAreas.trim())));
  const updateAnswer = (id: string, patch: PreviewAnswer) => setAnswers((previous) => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  function reset() {
    setAnswers({}); setValues({}); setFeedback(emptyFeedback); setResetKey((key) => key + 1);
  }
  return (
    <dialog className="admin-preview-overlay" ref={dialog} aria-labelledby={titleId} aria-describedby={hintId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        // Keep Tab inside the page, including the forward boundary where native
        // dialogs may otherwise move focus to browser chrome for one keystroke.
        if (event.key !== 'Tab') return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
        const first = buttons[0]; const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="admin-preview-panel">
        <header className="admin-preview-panel__header" style={{ marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <p className="admin-form__hint">{t('admin.checklists.previewTitle', 'Preview')}</p>
            <h2 id={titleId} style={{ margin: 0 }}>{title}</h2>
            <p>{t('checklistPreview.employee', 'Sample employee')} / {t('checklistPreview.department', 'Sample department')}</p>
          </div>
          <button ref={closeButton} className="admin-dialog__close" style={{ flex: 'none', minWidth: 44, minHeight: 44 }} type="button" onClick={onClose} aria-label={t('admin.checklists.close', 'Close')}>×</button>
        </header>
        <p id={hintId} className="admin-form__hint">{t('admin.checklists.previewHint', 'This is a local simulation — nothing here is saved or sent to anyone.')}</p>
        {description && <p><RichDescription value={description} /></p>}
        {props.checklistId && props.photos && <ChecklistPhotoStrip checklistId={props.checklistId} photos={props.photos} title={title} />}
        {contextFields.length > 0 && <section aria-label={t('admin.checklists.contextFieldsTitle', 'General information')}>
          <h3>{t('admin.checklists.contextFieldsTitle', 'General information')}</h3>
          <ContextFields fields={[...contextFields].sort((a, b) => a.order - b.order)} values={values} disabled={false}
            onChange={(id, value) => setValues((previous) => ({ ...previous, [id]: value }))} t={t} />
        </section>}
        <div key={resetKey}>
          {groupItems(items, groups).map(({ group, items: groupCriteria }, groupIndex) => (
            <section key={group?.id ?? 'ungrouped'} aria-labelledby={`${titleId}-group-${groupIndex}`}>
              <h3 id={`${titleId}-group-${groupIndex}`}>{checklistLabel(group?.title ?? t('admin.checklists.ungroupedItems', 'Ungrouped criteria'), group ? numbering.groupNumbers.get(group.id) : undefined, showNumbering)}</h3>
              {groupCriteria.map((item) => (
                <PreviewCriterion key={item.id} item={item} number={showNumbering ? numbering.itemNumbers.get(item.id) ?? '' : ''} answer={answers[item.id]}
                  levels={checklistItemLevels(item, scoringMode, scaleLevels)} scoringMode={scoringMode} allowSkip={allowSkipAll || item.allowSkip === true}
                  cameraOnly={cameraOnly} onChange={(patch) => updateAnswer(item.id, patch)} t={t} />
              ))}
            </section>
          ))}
        </div>
        {feedbackEnabled && <section aria-label={t('checklistSessions.conduct.feedbackTitle', 'Structured feedback')}>
          <h3>{props.feedbackLayout?.title || t('checklistSessions.conduct.feedbackTitle', 'Structured feedback')}</h3>
          {feedbackRequired && <p className="admin-form__hint">{t('checklistPreview.feedbackRequired', 'Strengths and development areas are required.')}</p>}
          <div style={{ display: 'grid', gap: 10 }}><FeedbackFields config={config} draft={feedback} onDraftChange={setFeedback} t={t} /></div>
        </section>}
        <footer>
          <div role="status" className={complete && result.passed ? 'admin-preview-result admin-preview-result--pass' : 'admin-preview-result'}>
            {scoringMode === 'none' ? (
              <strong>{complete ? t('checklists.finishedNoPoints', 'Completed') : t('checklistPreview.incomplete', 'Incomplete')}</strong>
            ) : (
              <>
                <span>{complete ? (result.passed ? t('admin.checklists.previewPassed', 'Pass') : t('admin.checklists.previewFailed', 'Fail')) : t('checklistPreview.incomplete', 'Incomplete')}</span>
                <strong>{result.totalScore} / {result.maxScore} ({result.percentage}%)</strong>
              </>
            )}
          </div>
          {scoringMode !== 'none' && <p className="admin-form__hint">{t('checklistPreview.scoreHint', 'The percentage is calculated from answered criteria. Skipped criteria are excluded.')}</p>}
          <div className="admin-form__actions">
            <Button type="button" variant="secondary" onClick={reset}>{t('admin.checklists.previewReset', 'Reset')}</Button>
            <Button type="button" onClick={onClose}>{t('admin.checklists.close', 'Close')}</Button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

function PreviewCriterion({ item, number, answer, levels, scoringMode, allowSkip, cameraOnly, onChange, t }: {
  item: ChecklistItemSummary; number: string; answer: PreviewAnswer | undefined; levels: ChecklistScaleLevel[] | null;
  scoringMode: ChecklistScoringMode; allowSkip: boolean; cameraOnly: boolean; onChange: (patch: PreviewAnswer) => void; t: TFunction;
}) {
  const id = useId();
  const photoInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const options = levels ?? [
    { level: 1, label: t('checklistPreview.yes', 'Yes'), points: scoringMode === 'all_required' ? 1 : item.points },
    { level: 0, label: t('checklistPreview.no', 'No'), points: 0 },
  ];
  const noteShown = isNoteOffered(item, answer && !answer.skipped ? answer : undefined, levels !== null);
  return <div style={{ padding: '20px 0', borderBottom: '1px solid var(--color-border)' }}>
    <CriterionHeading text={item.text} number={number} required={item.isRequired} t={t} />
    <ChecklistItemDescription item={item} t={t} />
    <div role="radiogroup" aria-required={item.isRequired} aria-label={checklistLabel(item.text, number)} style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
      {options.map((level) => <label key={level.level} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}>
        <input type="radio" style={{ width: 'auto', flex: 'none' }} name={id} checked={!answer?.skipped && (levels ? answer?.scaleLevel === level.level : answer?.answered === true && answer.checked === (level.level === 1))}
          onChange={() => onChange(levels ? { scaleLevel: level.level, skipped: false, answered: true } : { checked: level.level === 1, skipped: false, answered: true })} />
        <span style={{ flex: 1 }}>{level.label}{level.description && <span style={{ display: 'block' }}><RichDescription value={level.description} /></span>}</span>
      </label>)}
    </div>
    {noteShown && <ChecklistNoteField id={`${id}-note`} onChange={(value) => onChange({ comment: value })} required={isNoteRequired(item, answer, levels !== null)} t={t} value={answer?.comment ?? ''} />}
    {allowSkip && <Button type="button" size="sm" variant="ghost" aria-pressed={answer?.skipped === true}
      onClick={() => onChange({ skipped: !answer?.skipped })}>{t('checklistSessions.conduct.skip', 'Skip')}</Button>}
    {item.photoRequired && <div>
      <input ref={photoInput} type="file" accept={CHECKLIST_PHOTO_ACCEPT} capture={cameraOnly ? 'environment' : undefined} hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const issue = validateChecklistPhoto(file);
          if (issue) { setError(checklistPhotoErrorMessage(issue, t)); event.target.value = ''; return; }
          setError(null); setFileName(file.name); onChange({ hasPhoto: true });
        }} />
      <Button type="button" size="sm" variant="secondary" onClick={() => photoInput.current?.click()}>{t('checklistPreview.attachPhoto', 'Attach photo (local preview)')}</Button>
      {fileName && <p className="admin-form__hint">{fileName}</p>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
