import { RichText } from '../../shared/RichText.js';
import { checklistResultText } from '../../shared/checklistResultText.js';
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
import { CriterionOptions, yesNoOptions, type CriterionOption } from '../../shared/CriterionOptions.js';
import { AppearanceBlock, itemCardStyle } from '../../shared/AppearanceBlock.js';
import type { Appearance } from '@lms/shared/checklist-appearance';
import { computePreviewResult, groupItems, previewUnfinishedItems, type PreviewAnswer } from './domain.js';

type PreviewProps = {
  title: string; description: string; items: ChecklistItemSummary[]; groups: ChecklistItemGroup[];
  // PR 421: the sheet's extra pictures, shown under the description like the employee sees them.
  checklistId?: string; photos?: ChecklistPhotoSummary[];
  contextFields: ContextField[]; scoringMode: ChecklistScoringMode; scaleLevels: ChecklistScaleLevel[];
  showPointsToLearner?: boolean; showNumbering?: boolean; showSheetPhotos?: boolean; passThreshold: number; feedbackEnabled: boolean; feedbackRequired: boolean; allowSkipAll: boolean;
  feedbackLayout?: FeedbackLayout | null;
  // PR 422: the look of the sheet blocks, as the employee sees it.
  appearance?: Appearance | null;
  cameraOnly: boolean; onClose: () => void; t: TFunction;
};

/** PR 447: the gap between sheet blocks is a wrapper's own, so it exists whether or not the author styled the block. */
const BLOCK_GAP = { marginBottom: 12 } as const;
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
  // PR 424: the result is shown only after "Finish", like the employee sees it; nothing is saved.
  const [finished, setFinished] = useState(false);
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
  const unfinished = previewUnfinishedItems(items, scoringMode, scaleLevels, answers, allowSkipAll);
  const missingContext = contextFields.filter((field) => field.required && !values[field.id]?.trim());
  const feedbackMissing = feedbackEnabled && !(isCustomFeedback(props.feedbackLayout) ? !firstMissingRequiredFeedback(props.feedbackLayout!, feedback.answers ?? {}) : !feedbackRequired || Boolean(feedback.strengths.trim() && feedback.developmentAreas.trim()));
  /** Moves to the first unfilled place and puts the keyboard focus there. */
  function goTo(target: Element | null | undefined) {
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    (target.querySelector<HTMLElement>('input, textarea, select, button') ?? (target as HTMLElement)).focus({ preventScroll: true });
  }
  const criterionElement = (id: string) => [...(dialog.current?.querySelectorAll('[data-criterion]') ?? [])].find((node) => (node as HTMLElement).dataset.criterion === id);
  function finish() {
    setFinished(true);
    // The list renders after this update; the first unfilled place is the same one the list starts with.
    requestAnimationFrame(() => {
      if (missingContext[0]) goTo(dialog.current?.querySelector(`[id="${titleId}-info"]`));
      else if (unfinished[0]) goTo(criterionElement(unfinished[0].id));
      else if (feedbackMissing) goTo(dialog.current?.querySelector(`[id="${titleId}-feedback"]`));
      else dialog.current?.querySelector('[data-testid="preview-finish-result"]')?.scrollIntoView({ block: 'center' });
    });
  }
  const updateAnswer = (id: string, patch: PreviewAnswer) => setAnswers((previous) => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  function reset() {
    setAnswers({}); setValues({}); setFeedback(emptyFeedback); setFinished(false); setResetKey((key) => key + 1);
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
        <AppearanceBlock appearance={props.appearance} kind="header" style={{ marginBottom: 8 }}>
        <header className="admin-preview-panel__header" style={{ marginBottom: 4 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="admin-form__hint">{t('admin.checklists.previewTitle', 'Preview')}</p>
            {/* PR 445: the pictures of the sheet come first, above its title (the close button stays at the top). */}
            {props.showSheetPhotos !== false && props.checklistId && props.photos && <ChecklistPhotoStrip checklistId={props.checklistId} photos={props.photos} title={title} />}
            <h2 id={titleId} style={{ margin: 0 }}><RichText value={title} /></h2>
            <p>{t('checklistPreview.employee', 'Sample employee')} / {t('checklistPreview.department', 'Sample department')}</p>
          </div>
          <button ref={closeButton} className="admin-dialog__close" style={{ flex: 'none', minWidth: 44, minHeight: 44 }} type="button" onClick={onClose} aria-label={t('admin.checklists.close', 'Close')}>×</button>
        </header>
        <p id={hintId} className="admin-form__hint">{t('admin.checklists.previewHint', 'This is a local simulation — nothing here is saved or sent to anyone.')}</p>
        {description && <p><RichDescription value={description} /></p>}
        </AppearanceBlock>
        {contextFields.length > 0 && <div style={BLOCK_GAP}><AppearanceBlock appearance={props.appearance} kind="info"><section id={`${titleId}-info`} aria-label={t('admin.checklists.contextFieldsTitle', 'General information')}>
          <h3>{t('admin.checklists.contextFieldsTitle', 'General information')}</h3>
          <ContextFields fields={[...contextFields].sort((a, b) => a.order - b.order)} values={values} disabled={false}
            onChange={(id, value) => setValues((previous) => ({ ...previous, [id]: value }))} t={t} />
        </section></AppearanceBlock></div>}
        <div key={resetKey}>
          {groupItems(items, groups).map(({ group, items: groupCriteria }, groupIndex) => (
            <div key={group?.id ?? 'ungrouped'} style={BLOCK_GAP}><AppearanceBlock appearance={props.appearance} kind="group" id={group?.id}>
            {/* PR 447: a sheet without groups shows its criteria at once; "Ungrouped criteria" is only a title next to real groups. */}
            <section aria-labelledby={groups.length > 0 ? `${titleId}-group-${groupIndex}` : undefined}>
              {groups.length > 0 && <h3 id={`${titleId}-group-${groupIndex}`}><RichText value={checklistLabel(group?.title ?? t('admin.checklists.ungroupedItems', 'Ungrouped criteria'), group ? numbering.groupNumbers.get(group.id) : undefined, showNumbering)} /></h3>}
              {groupCriteria.map((item) => (
                <PreviewCriterion key={item.id} item={item} number={showNumbering ? numbering.itemNumbers.get(item.id) ?? '' : ''} answer={answers[item.id]}
                  levels={checklistItemLevels(item, scoringMode, scaleLevels)} scoringMode={scoringMode} allowSkip={allowSkipAll || item.allowSkip === true}
                  cameraOnly={cameraOnly} appearance={props.appearance} onChange={(patch) => updateAnswer(item.id, patch)} t={t} />
              ))}
            </section>
            </AppearanceBlock></div>
          ))}
        </div>
        {feedbackEnabled && <div style={BLOCK_GAP}><AppearanceBlock appearance={props.appearance} kind="feedback"><section id={`${titleId}-feedback`} aria-label={t('checklistSessions.conduct.feedbackTitle', 'Structured feedback')}>
          <h3><RichText value={props.feedbackLayout?.title || t('checklistSessions.conduct.feedbackTitle', 'Structured feedback')} /></h3>
          <div style={{ display: 'grid', gap: 10 }}><FeedbackFields config={config} draft={feedback} onDraftChange={setFeedback} t={t} /></div>
        </section></AppearanceBlock></div>}
        <footer>
          {finished && (complete ? (
            <div role="status" data-testid="preview-finish-result" className={result.passed ? 'admin-preview-result admin-preview-result--pass' : 'admin-preview-result'}>
              <span>{t('checklistPreview.finished', 'Sheet completed')}</span>
              {scoringMode === 'none' ? (
                <strong>{t('checklists.finishedNoPoints', 'Completed')}</strong>
              ) : (
                <>
                  <span>{result.passed ? t('checklists.resultPassed', 'Passed') : t('checklists.resultNotPassed', 'Not passed')}</span>
                  <strong>{checklistResultText(result, props.showPointsToLearner === true, t)}</strong>
                </>
              )}
            </div>
          ) : (
            <div role="alert" data-testid="preview-finish-missing" className="admin-preview-result">
              <strong>{t('checklistPreview.cannotFinish', 'The sheet cannot be completed yet')}</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {missingContext.length > 0 && <li><button type="button" className="ds-button ds-button--ghost ds-button--sm" onClick={() => goTo(dialog.current?.querySelector(`[id="${titleId}-info"]`))}>{t('checklistPreview.missingContext', 'General information: {{count}} required', { count: missingContext.length })}</button></li>}
                {unfinished.slice(0, 5).map((item) => <li key={item.id}><button type="button" className="ds-button ds-button--ghost ds-button--sm" onClick={() => goTo(criterionElement(item.id))}><RichText value={item.text} /></button></li>)}
                {unfinished.length > 5 && <li>{t('checklistPreview.missingMore', 'and {{count}} more criteria', { count: unfinished.length - 5 })}</li>}
                {feedbackMissing && <li><button type="button" className="ds-button ds-button--ghost ds-button--sm" onClick={() => goTo(dialog.current?.querySelector(`[id="${titleId}-feedback"]`))}>{t('checklistSessions.conduct.feedbackTitle', 'Structured feedback')}</button></li>}
              </ul>
              <p className="admin-form__hint" style={{ margin: '4px 0 0' }}>{t('checklistSessions.conduct.incompleteHint', 'All required criteria must be answered before completing.')}</p>
            </div>
          ))}
          {finished && complete && scoringMode !== 'none' && <p className="admin-form__hint">{t('checklistPreview.scoreHint', 'The percentage is calculated from answered criteria. Skipped criteria are excluded.')}</p>}
          {finished && <p className="admin-form__hint">{t('checklistPreview.simulation', 'Simulation: nothing was saved or sent.')}</p>}
          <div className="admin-form__actions">
            <Button type="button" onClick={finish}>{t('checklistPreview.finish', 'Finish')}</Button>
            <Button type="button" variant="secondary" onClick={reset}>{t('admin.checklists.previewReset', 'Reset')}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>{t('admin.checklists.close', 'Close')}</Button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

/** PR 425: the patch that takes an answer back (the preview keeps only what was typed in the note). */
const CLEARED_ANSWER: PreviewAnswer = { answered: false, skipped: false, checked: false, scaleLevel: undefined };

function PreviewCriterion({ item, number, answer, levels, scoringMode, allowSkip, cameraOnly, appearance, onChange, t }: {
  appearance?: Appearance | null;
  item: ChecklistItemSummary; number: string; answer: PreviewAnswer | undefined; levels: ChecklistScaleLevel[] | null;
  scoringMode: ChecklistScoringMode; allowSkip: boolean; cameraOnly: boolean; onChange: (patch: PreviewAnswer) => void; t: TFunction;
}) {
  const id = useId();
  const photoInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // PR 448: the answer area is the one shared component (also used by the learner's sheet and the observer's session).
  const options: CriterionOption[] = levels
    ? levels.map((level) => ({ key: level.level, label: level.label, description: level.description, points: level.points ?? 0, color: level.color }))
    : yesNoOptions(t, scoringMode === 'all_required' ? 1 : item.points ?? 0);
  const selectedKey = answer?.skipped || !answer?.answered ? null : levels ? answer.scaleLevel ?? null : answer.checked ? 1 : 0;
  const noteShown = isNoteOffered(item, answer && !answer.skipped ? answer : undefined, levels !== null);
  return <div data-criterion={item.id} style={itemCardStyle(appearance, item.id, { padding: '20px 0', borderBottom: '1px solid var(--color-border)' }, '#166534', answer?.answered === true)}>
    <CriterionHeading text={item.text} number={number} required={item.isRequired} t={t} />
    <ChecklistItemDescription item={item} t={t} />
    <CriterionOptions text={item.text} number={number} required={item.isRequired} options={options} selectedKey={selectedKey} scoringMode={scoringMode}
      canClear={answer?.answered === true && !answer.skipped} clearLabel={t('checklistPreview.clearAnswer', 'Clear answer')}
      onChoose={(key) => onChange(levels ? { scaleLevel: key, skipped: false, answered: true } : { checked: key === 1, skipped: false, answered: true })}
      onClear={() => onChange(CLEARED_ANSWER)} />
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
