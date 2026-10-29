import { useEffect, useId, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { ContextFields, CriterionHeading, FeedbackFields, type FeedbackDraft } from '../../app/ChecklistConductFields.js';
import { checklistItemLevels } from '../../app/checklistCompletion.js';
import type { ChecklistItemGroup, ChecklistItemSummary, ChecklistScaleLevel, ChecklistScoringMode, ContextField } from '../../shared/api/types.js';
import { CHECKLIST_PHOTO_ACCEPT, checklistPhotoErrorMessage, validateChecklistPhoto } from '../../shared/checklistPhoto.js';
import { Button } from '../../shared/ui.js';
import { computePreviewResult, groupItems, type PreviewAnswer } from './domain.js';

type PreviewProps = {
  title: string; description: string; items: ChecklistItemSummary[]; groups: ChecklistItemGroup[];
  contextFields: ContextField[]; scoringMode: ChecklistScoringMode; scaleLevels: ChecklistScaleLevel[];
  passThreshold: number; feedbackEnabled: boolean; feedbackRequired: boolean; allowSkipAll: boolean;
  cameraOnly: boolean; onClose: () => void; t: TFunction;
};

const emptyFeedback: FeedbackDraft = { strengths: '', developmentAreas: '', nextSteps: '' };

/** Local draft only: this component never loads a session or invokes a mutation/upload. */
export function ChecklistPreviewDialog(props: PreviewProps) {
  const { title, description, items, groups, contextFields, scoringMode, scaleLevels, passThreshold, feedbackEnabled, feedbackRequired, allowSkipAll, cameraOnly, onClose, t } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const hintId = useId();
  const [answers, setAnswers] = useState<Record<string, PreviewAnswer>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<FeedbackDraft>(emptyFeedback);
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

  const result = computePreviewResult(items, scoringMode, scaleLevels, passThreshold, answers, allowSkipAll, true);
  const complete = result.allAnswered && contextFields.every((field) => !field.required || values[field.id]?.trim())
    && (!feedbackEnabled || !feedbackRequired || Boolean(feedback.strengths.trim() && feedback.developmentAreas.trim()));
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
        {description && <p>{description}</p>}
        {contextFields.length > 0 && <section aria-label={t('admin.checklists.contextFieldsTitle', 'General information')}>
          <h3>{t('admin.checklists.contextFieldsTitle', 'General information')}</h3>
          <ContextFields fields={[...contextFields].sort((a, b) => a.order - b.order)} values={values} disabled={false}
            onChange={(id, value) => setValues((previous) => ({ ...previous, [id]: value }))} t={t} />
        </section>}
        <div key={resetKey}>
          {groupItems(items, groups).map(({ group, items: groupCriteria }, groupIndex) => (
            <section key={group?.id ?? 'ungrouped'} aria-labelledby={`${titleId}-group-${groupIndex}`}>
              <h3 id={`${titleId}-group-${groupIndex}`}>{groupIndex + 1} {group?.title ?? t('admin.checklists.ungroupedItems', 'Ungrouped criteria')}</h3>
              {groupCriteria.map((item, index) => (
                <PreviewCriterion key={item.id} item={item} number={`${groupIndex + 1}.${index + 1}`} answer={answers[item.id]}
                  levels={checklistItemLevels(item, scoringMode, scaleLevels)} scoringMode={scoringMode} allowSkip={allowSkipAll || item.allowSkip === true}
                  cameraOnly={cameraOnly} onChange={(patch) => updateAnswer(item.id, patch)} t={t} />
              ))}
            </section>
          ))}
        </div>
        {feedbackEnabled && <section aria-label={t('checklistSessions.conduct.feedbackTitle', 'Structured feedback')}>
          <h3>{t('checklistSessions.conduct.feedbackTitle', 'Structured feedback')}</h3>
          {feedbackRequired && <p className="admin-form__hint">{t('checklistPreview.feedbackRequired', 'Strengths and development areas are required.')}</p>}
          <div style={{ display: 'grid', gap: 10 }}><FeedbackFields draft={feedback} onDraftChange={setFeedback} t={t} /></div>
        </section>}
        <footer>
          <div role="status" className={complete && result.passed ? 'admin-preview-result admin-preview-result--pass' : 'admin-preview-result'}>
            <span>{complete ? (result.passed ? t('admin.checklists.previewPassed', 'Pass') : t('admin.checklists.previewFailed', 'Fail')) : t('checklistPreview.incomplete', 'Incomplete')}</span>
            <strong>{result.totalScore} / {result.maxScore} ({result.percentage}%)</strong>
          </div>
          <p className="admin-form__hint">{t('checklistPreview.scoreHint', 'The percentage is calculated from answered criteria. Skipped criteria are excluded.')}</p>
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
  return <div style={{ padding: '20px 0', borderBottom: '1px solid var(--color-border)' }}>
    <CriterionHeading text={`${number} ${item.text}`} required={item.isRequired} t={t} />
    <div role="radiogroup" aria-required={item.isRequired} aria-label={`${number} ${item.text}`} style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
      {options.map((level) => <label key={level.level} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}>
        <input type="radio" style={{ width: 'auto', flex: 'none' }} name={id} checked={!answer?.skipped && (levels ? answer?.scaleLevel === level.level : answer?.answered === true && answer.checked === (level.level === 1))}
          onChange={() => onChange(levels ? { scaleLevel: level.level, skipped: false, answered: true } : { checked: level.level === 1, skipped: false, answered: true })} />
        <span style={{ flex: 1 }}>{level.label}</span><small style={{ color: 'var(--color-text-muted)' }}>{t('checklistPreview.points', '{{points}} pts', { points: level.points })}</small>
      </label>)}
    </div>
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
