import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import { formatDate } from '../../shared/formatDate.js';
import {
  bulkCreateChecklistSessions,
  getChecklistSession,
  listChecklistSessionParticipants,
  listPublishedChecklists,
  transitionChecklistSession,
} from '../../shared/api/checklistSessions.js';
import type {
  ChecklistGeolocationPolicy,
  ChecklistSessionParticipant,
  ChecklistSummary,
} from '../../shared/api/types.js';
import { Badge, Button, Card, InlineFeedback, Input, Select, WizardDialog, type WizardStep } from '../../shared/ui.js';
import {
  canProceedFromChecklistStep,
  canProceedFromParticipantsStep,
  canProceedFromScheduleStep,
  buildIndividualSessionSchedules,
  formatParticipantName,
  isSessionDurationValid,
  MAX_BULK_SESSION_LEARNERS,
  partitionBulkCreateResults,
  toSessionScheduledAt,
  type ScheduleMode,
  type SessionScheduleDraft,
} from './domain.js';

const SEARCH_DEBOUNCE_MS = 300;
const SCHEDULE_OPTION_STYLE = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' } as const;
const SCHEDULE_RADIO_STYLE = { width: 16, height: 16, minHeight: 16, margin: 0, flexShrink: 0 } as const;

/** Shared with ReassignObserverDialog.tsx (PR 302) -- same debounced-search pattern, same delay. */
export function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  t: TFunction;
};

type ScheduleInputProps = { value: string; onChange: (value: string) => void; t: TFunction };

function SessionTimeInput({ value, onChange, t }: ScheduleInputProps) {
  return <Input
    label={t('admin.checklists.sessions.wizard.scheduledAt', 'Date and time')}
    error={value && !toSessionScheduledAt(value) ? t('admin.checklists.sessions.wizard.invalidLocalTime', 'This time is invalid or does not exist. Choose another date or time.') : undefined}
    onChange={(event) => onChange(event.target.value)}
    required type="datetime-local" value={value}
  />;
}

function SessionDurationInput({ value, onChange, t }: ScheduleInputProps) {
  const hint = t('admin.checklists.sessions.wizard.durationHint', 'From 1 to 1440 minutes. Leave blank if the duration is not known yet.');
  return <Input
    label={t('admin.checklists.sessions.wizard.durationMinutes', 'Duration in minutes (optional)')}
    hint={hint} error={isSessionDurationValid(value) ? undefined : hint}
    min={1} max={1440} step={1} type="number"
    onChange={(event) => onChange(event.target.value)} value={value}
  />;
}

export function ChecklistSessionWizard({ open, onClose, onCreated, t }: Props) {
  const [step, setStep] = useState(0);

  const [learnerSearch, setLearnerSearch] = useState('');
  const debouncedLearnerSearch = useDebounced(learnerSearch);
  const [learnerResults, setLearnerResults] = useState<ChecklistSessionParticipant[]>([]);
  const [selectedLearners, setSelectedLearners] = useState<Map<string, ChecklistSessionParticipant>>(new Map());

  const [observerSearch, setObserverSearch] = useState('');
  const debouncedObserverSearch = useDebounced(observerSearch);
  const [observerResults, setObserverResults] = useState<ChecklistSessionParticipant[]>([]);
  const [selectedObserver, setSelectedObserver] = useState<ChecklistSessionParticipant | null>(null);

  const [checklists, setChecklists] = useState<ChecklistSummary[]>([]);
  const [selectedChecklistId, setSelectedChecklistId] = useState('');

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [locationPolicy, setLocationPolicy] = useState<ChecklistGeolocationPolicy>('off');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{ created: number; skipped: number; failed: number } | null>(null);
  // Distinguishes "still loading" from "no published checklists" (an empty result is a real answer).
  const [checklistsLoaded, setChecklistsLoaded] = useState(false);
  const [scheduleGrouping, setScheduleGrouping] = useState<'shared' | 'individual'>('shared');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [individualDrafts, setIndividualDrafts] = useState<Record<string, SessionScheduleDraft>>({});

  const sharedDraft = { scheduledAt, durationMinutes };
  const individualSchedules = buildIndividualSessionSchedules([...selectedLearners.keys()], individualDrafts, sharedDraft, timezone);
  const scheduleValid = scheduleGrouping === 'individual'
    ? individualSchedules !== null
    : canProceedFromScheduleStep(scheduleMode, scheduledAt, durationMinutes);

  function updateIndividualSchedule(learnerId: string, patch: Partial<SessionScheduleDraft>) {
    setIndividualDrafts((previous) => ({ ...previous, [learnerId]: { ...(previous[learnerId] ?? sharedDraft), ...patch } }));
  }

  useEffect(() => {
    if (!open || step !== 0) return;
    let cancelled = false;
    listChecklistSessionParticipants({ role: 'learner', search: debouncedLearnerSearch || undefined, pageSize: 20 })
      .then((result) => { if (!cancelled) setLearnerResults(result.items); })
      .catch(() => { if (!cancelled) setLearnerResults([]); });
    return () => { cancelled = true; };
  }, [open, step, debouncedLearnerSearch]);

  useEffect(() => {
    if (!open || step !== 0) return;
    let cancelled = false;
    listChecklistSessionParticipants({ role: 'observer', search: debouncedObserverSearch || undefined, pageSize: 20 })
      .then((result) => { if (!cancelled) setObserverResults(result.items); })
      .catch(() => { if (!cancelled) setObserverResults([]); });
    return () => { cancelled = true; };
  }, [open, step, debouncedObserverSearch]);

  useEffect(() => {
    if (!open || step !== 1 || checklistsLoaded) return;
    let cancelled = false;
    listPublishedChecklists()
      .then((result) => { if (!cancelled) { setChecklists(result); setChecklistsLoaded(true); } })
      .catch(() => { if (!cancelled) setChecklists([]); });
    return () => { cancelled = true; };
  }, [open, step, checklistsLoaded]);

  function reset() {
    setStep(0);
    setLearnerSearch('');
    setLearnerResults([]);
    setSelectedLearners(new Map());
    setObserverSearch('');
    setObserverResults([]);
    setSelectedObserver(null);
    setChecklists([]);
    setChecklistsLoaded(false);
    setScheduleGrouping('shared');
    setDurationMinutes('');
    setIndividualDrafts({});
    setSelectedChecklistId('');
    setScheduleMode('now');
    setScheduledAt('');
    setLocationPolicy('off');
    setSubmitting(false);
    setSubmitError(null);
    setSubmitResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function toggleLearner(participant: ChecklistSessionParticipant) {
    setSelectedLearners((prev) => {
      const next = new Map(prev);
      if (next.has(participant.id)) next.delete(participant.id);
      else next.set(participant.id, participant);
      return next;
    });
  }

  // The observer can't also be one of this batch's employees: picking them drops them from the selection.
  function selectObserver(participant: ChecklistSessionParticipant) {
    setSelectedObserver(participant);
    setSelectedLearners((prev) => {
      if (!prev.has(participant.id)) return prev;
      const next = new Map(prev);
      next.delete(participant.id);
      return next;
    });
  }

  async function submit() {
    if (!selectedObserver || selectedLearners.size === 0 || !scheduleValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await bulkCreateChecklistSessions({
        checklistId: selectedChecklistId,
        learnerIds: [...selectedLearners.keys()],
        observerId: selectedObserver.id,
        ...(scheduleGrouping === 'individual'
          ? { schedules: individualSchedules! }
          : { scheduledAt: scheduleMode === 'later' ? toSessionScheduledAt(scheduledAt) : null, durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : null }),
        locationCapturePolicy: locationPolicy,
        timezone,
      });
      if (scheduleGrouping === 'shared' && scheduleMode === 'now') {
        const createdIds = result.results.filter((r) => r.status === 'created' && r.sessionId).map((r) => r.sessionId!);
        await Promise.all(createdIds.map(async (sessionId) => {
          try {
            const session = await getChecklistSession(sessionId);
            await transitionChecklistSession(sessionId, 'start', session.version, crypto.randomUUID());
          } catch {
            // Leave the session scheduled if it couldn't be auto-started -- it still exists and
            // can be started manually from the list; the bulk-create outcome itself is unaffected.
          }
        }));
      }
      const partitioned = partitionBulkCreateResults(result);
      setSubmitResult({ created: partitioned.created.length, skipped: partitioned.skipped.length, failed: partitioned.failed.length });
      onCreated();
    } catch (error) {
      setSubmitError(error instanceof ApiClientError ? error.message : t('admin.checklists.sessions.wizard.submitError', 'Unable to create sessions.'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (submitResult) {
      handleClose();
      return;
    }
    if (step === 0 && canProceedFromParticipantsStep([...selectedLearners.keys()], selectedObserver?.id ?? '')) {
      setStep(1);
    } else if (step === 1 && canProceedFromChecklistStep(selectedChecklistId)) {
      setStep(2);
    } else if (step === 2 && scheduleValid) {
      setStep(3);
    } else if (step === 3) {
      void submit();
    }
  }

  const steps: WizardStep[] = [
    { key: 'participants', label: t('admin.checklists.sessions.wizard.steps.participants', 'Participants') },
    { key: 'checklist', label: t('admin.checklists.sessions.wizard.steps.checklist', 'Checklist') },
    { key: 'schedule', label: t('admin.checklists.sessions.wizard.steps.schedule', 'Time and place') },
    { key: 'confirm', label: t('admin.checklists.sessions.wizard.steps.confirm', 'Confirm') },
  ];

  const limitReached = selectedLearners.size >= MAX_BULK_SESSION_LEARNERS;
  const learnerOptions = learnerResults.filter((participant) => participant.id !== selectedObserver?.id);
  const selectedChecklist = checklists.find((c) => c.id === selectedChecklistId) ?? null;

  const nextDisabled = submitResult
    ? false
    : step === 0
      ? !canProceedFromParticipantsStep([...selectedLearners.keys()], selectedObserver?.id ?? '')
      : step === 1
        ? !canProceedFromChecklistStep(selectedChecklistId)
        : !scheduleValid;

  return (
    <WizardDialog
      busy={submitting}
      cancelLabel={t('admin.checklists.sessions.wizard.cancel', 'Cancel')}
      backLabel={t('admin.checklists.sessions.wizard.back', 'Back')}
      currentStep={step}
      nextDisabled={nextDisabled}
      nextLabel={submitResult ? t('admin.checklists.sessions.wizard.close', 'Close') : step === 3 ? t('admin.checklists.sessions.wizard.create', 'Create') : t('admin.checklists.sessions.wizard.next', 'Next')}
      onBack={submitResult ? handleClose : () => setStep((s) => Math.max(0, s - 1))}
      onClose={handleClose}
      onNext={handleNext}
      open={open}
      steps={steps}
      title={t('admin.checklists.sessions.wizard.title', 'New session')}
    >
      {submitResult ? (
        <InlineFeedback tone="success" title={t('admin.checklists.sessions.wizard.doneTitle', 'Sessions created')}>
          {t('admin.checklists.sessions.wizard.doneSummary', '{{created}} created, {{skipped}} skipped, {{failed}} failed.', submitResult)}
        </InlineFeedback>
      ) : (
        <>
          {step === 0 && (
            <div>
              <h3>{t('admin.checklists.sessions.wizard.observerLabel', 'Observer')}</h3>
              {selectedObserver ? (
                <Card compact>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span className="ds-wizard-dialog__picklist-text">
                      <span className="ds-wizard-dialog__picklist-name">{formatParticipantName(selectedObserver)}</span>
                      <span className="ds-wizard-dialog__picklist-email">{selectedObserver.email}</span>
                    </span>
                    <Button onClick={() => setSelectedObserver(null)} size="sm" type="button" variant="secondary">
                      {t('admin.checklists.sessions.wizard.observerChange', 'Change observer')}
                    </Button>
                  </div>
                </Card>
              ) : (
                <>
                  <Input
                    aria-label={t('admin.checklists.sessions.wizard.observerSearch', 'Find observer')}
                    onChange={(e) => setObserverSearch(e.target.value)}
                    placeholder={t('admin.checklists.sessions.wizard.observerSearch', 'Find observer')}
                    value={observerSearch}
                  />
                  <ul className="ds-wizard-dialog__picklist">
                    {observerResults.map((participant) => (
                      <li key={participant.id}>
                        <label>
                          <input
                            checked={false}
                            name="observer"
                            onChange={() => selectObserver(participant)}
                            type="radio"
                          />
                          <span className="ds-wizard-dialog__picklist-text">
                            <span className="ds-wizard-dialog__picklist-name">{formatParticipantName(participant)}</span>
                            <span className="ds-wizard-dialog__picklist-email">{participant.email}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h3>{t('admin.checklists.sessions.wizard.learnersLabel', 'Employees')}</h3>
              <Input
                aria-label={t('admin.checklists.sessions.wizard.learnerSearch', 'Find employee')}
                onChange={(e) => setLearnerSearch(e.target.value)}
                placeholder={t('admin.checklists.sessions.wizard.learnerSearch', 'Find employee')}
                value={learnerSearch}
              />
              <p aria-live="polite">{t('admin.checklists.sessions.wizard.learnersSelected', '{{count}} of {{max}} selected', { count: selectedLearners.size, max: MAX_BULK_SESSION_LEARNERS })}</p>
              {selectedLearners.size > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[...selectedLearners.values()].map((participant) => (
                    <Badge key={participant.id} variant="accent">
                      {formatParticipantName(participant)}
                      <button
                        aria-label={t('admin.checklists.sessions.wizard.learnerRemove', 'Remove {{name}}', { name: formatParticipantName(participant) })}
                        onClick={() => toggleLearner(participant)}
                        style={{ minWidth: 24, minHeight: 24, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}
                        type="button"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {limitReached && (
                <p role="status">{t('admin.checklists.sessions.wizard.learnersLimitReached', 'Limit reached: at most {{max}} employees per batch. Remove someone to add another.', { max: MAX_BULK_SESSION_LEARNERS })}</p>
              )}
              <ul className="ds-wizard-dialog__picklist">
                {learnerOptions.map((participant) => (
                  <li key={participant.id}>
                    <label>
                      <input
                        checked={selectedLearners.has(participant.id)}
                        disabled={limitReached && !selectedLearners.has(participant.id)}
                        onChange={() => toggleLearner(participant)}
                        type="checkbox"
                      />
                      <span className="ds-wizard-dialog__picklist-text">
                        <span className="ds-wizard-dialog__picklist-name">{formatParticipantName(participant)}</span>
                        <span className="ds-wizard-dialog__picklist-email">{participant.email}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 1 && (
            <div>
              <h3>{t('admin.checklists.sessions.wizard.checklistLabel', 'Checklist')}</h3>
              {checklistsLoaded && checklists.length === 0 && (
                <InlineFeedback tone="warning">
                  {t('admin.checklists.sessions.wizard.checklistsEmpty', 'There are no published checklists yet. Publish a checklist on the "Checklists" tab first, then create a session.')}
                </InlineFeedback>
              )}
              <ul className="ds-wizard-dialog__picklist">
                {checklists.map((checklist) => (
                  <li key={checklist.id}>
                    <label>
                      <input
                        checked={selectedChecklistId === checklist.id}
                        name="checklist"
                        onChange={() => setSelectedChecklistId(checklist.id)}
                        type="radio"
                      />
                      {checklist.title}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 2 && (
            <div>
              <fieldset style={{ margin: '0 0 16px', border: 0, padding: 0 }}>
                <legend>{t('admin.checklists.sessions.wizard.scheduleGrouping', 'Employee schedules')}</legend>
                <label style={SCHEDULE_OPTION_STYLE}>
                  <input style={SCHEDULE_RADIO_STYLE} checked={scheduleGrouping === 'shared'} name="scheduleGrouping" onChange={() => setScheduleGrouping('shared')} type="radio" />
                  {t('admin.checklists.sessions.wizard.scheduleShared', 'Same for everyone')}
                </label>
                <label style={SCHEDULE_OPTION_STYLE}>
                  <input style={SCHEDULE_RADIO_STYLE} checked={scheduleGrouping === 'individual'} name="scheduleGrouping" onChange={() => setScheduleGrouping('individual')} type="radio" />
                  {t('admin.checklists.sessions.wizard.scheduleIndividual', 'Set each separately')}
                </label>
              </fieldset>
              {scheduleGrouping === 'shared' ? (
                <>
                  <label style={SCHEDULE_OPTION_STYLE}>
                    <input style={SCHEDULE_RADIO_STYLE} checked={scheduleMode === 'now'} name="scheduleMode" onChange={() => setScheduleMode('now')} type="radio" />
                    {t('admin.checklists.sessions.wizard.startNow', 'Start now')}
                  </label>
                  <label style={SCHEDULE_OPTION_STYLE}>
                    <input style={SCHEDULE_RADIO_STYLE} checked={scheduleMode === 'later'} name="scheduleMode" onChange={() => setScheduleMode('later')} type="radio" />
                    {t('admin.checklists.sessions.wizard.scheduleLater', 'Schedule for later')}
                  </label>
                  {scheduleMode === 'later' && (
                    <>
                      <SessionTimeInput onChange={setScheduledAt} t={t} value={scheduledAt} />
                      {/* PR 303: only shown when there's an actual future instant to disambiguate --
                          "Start now" has nothing for a timezone to clarify. */}
                      <p>{t('admin.checklists.sessions.wizard.timezone', 'Timezone: {{timezone}}', { timezone })}</p>
                    </>
                  )}
                  <SessionDurationInput onChange={setDurationMinutes} t={t} value={durationMinutes} />
                </>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  <p>{t('admin.checklists.sessions.wizard.individualHint', 'Set a date and time for every employee. Duration is optional, from 1 to 1440 minutes.')}</p>
                  <p>{t('admin.checklists.sessions.wizard.timezone', 'Timezone: {{timezone}}', { timezone })}</p>
                  {[...selectedLearners.values()].map((learner) => {
                    const draft = individualDrafts[learner.id] ?? sharedDraft;
                    return (
                      <fieldset key={learner.id} style={{ display: 'grid', gap: 12, border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, minWidth: 0 }}>
                        <legend>{formatParticipantName(learner)}</legend>
                        <SessionTimeInput
                          onChange={(value) => updateIndividualSchedule(learner.id, { scheduledAt: value })}
                          t={t} value={draft.scheduledAt}
                        />
                        <SessionDurationInput
                          onChange={(value) => updateIndividualSchedule(learner.id, { durationMinutes: value })}
                          t={t} value={draft.durationMinutes}
                        />
                      </fieldset>
                    );
                  })}
                </div>
              )}
              <Select
                label={t('admin.checklists.sessions.wizard.locationPolicy', 'Location capture')}
                onChange={(e) => setLocationPolicy(e.target.value as ChecklistGeolocationPolicy)}
                value={locationPolicy}
              >
                <option value="off">{t('admin.checklists.sessions.wizard.locationOff', 'Off')}</option>
                <option value="optional">{t('admin.checklists.sessions.wizard.locationOptional', 'Optional')}</option>
                <option value="required">{t('admin.checklists.sessions.wizard.locationRequired', 'Required')}</option>
              </Select>
            </div>
          )}

          {step === 3 && (
            <div>
              {submitError && <InlineFeedback tone="error">{submitError}</InlineFeedback>}
              <dl>
                <dt>{t('admin.checklists.sessions.wizard.observerLabel', 'Observer')}</dt>
                <dd>{selectedObserver ? formatParticipantName(selectedObserver) : '—'}</dd>
                <dt>{t('admin.checklists.sessions.wizard.learnersLabel', 'Employees')}</dt>
                <dd>{selectedLearners.size}</dd>
                <dt>{t('admin.checklists.sessions.wizard.checklistLabel', 'Checklist')}</dt>
                <dd>{selectedChecklist?.title ?? '—'}</dd>
                {scheduleGrouping === 'shared' && (
                  <>
                    <dt>{t('admin.checklists.sessions.wizard.whenLabel', 'When')}</dt>
                    <dd>{scheduleMode === 'now' ? t('admin.checklists.sessions.wizard.startNow', 'Start now') : formatDate(toSessionScheduledAt(scheduledAt)!, undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone })}</dd>
                    <dt>{t('admin.checklists.sessions.wizard.durationMinutes', 'Duration in minutes (optional)')}</dt>
                    <dd>{durationMinutes || t('admin.checklists.sessions.wizard.durationNotSet', 'Not specified')}</dd>
                  </>
                )}
              </dl>
              {scheduleGrouping === 'individual' && (
                <>
                  <p>{t('admin.checklists.sessions.wizard.timezone', 'Timezone: {{timezone}}', { timezone })}</p>
                  <ul>
                    {individualSchedules?.map((schedule) => (
                      <li key={schedule.learnerId}>
                        <strong>{formatParticipantName(selectedLearners.get(schedule.learnerId)!)}</strong>{' — '}
                        {formatDate(schedule.scheduledAt, undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: schedule.timezone })}{' · '}
                        {schedule.durationMinutes === null
                          ? t('admin.checklists.sessions.wizard.durationNotSet', 'Not specified')
                          : t('admin.checklists.sessions.wizard.durationValue', '{{minutes}} min', { minutes: schedule.durationMinutes })}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      )}
    </WizardDialog>
  );
}
