import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
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
import { InlineFeedback, Input, Select, WizardDialog, type WizardStep } from '../../shared/ui.js';
import {
  canProceedFromChecklistStep,
  canProceedFromParticipantsStep,
  canProceedFromScheduleStep,
  formatParticipantName,
  MAX_BULK_SESSION_LEARNERS,
  partitionBulkCreateResults,
  type ScheduleMode,
} from './domain.js';

const SEARCH_DEBOUNCE_MS = 300;

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
    if (!open || step !== 1 || checklists.length > 0) return;
    let cancelled = false;
    listPublishedChecklists()
      .then((result) => { if (!cancelled) setChecklists(result); })
      .catch(() => { if (!cancelled) setChecklists([]); });
    return () => { cancelled = true; };
  }, [open, step, checklists.length]);

  function reset() {
    setStep(0);
    setLearnerSearch('');
    setLearnerResults([]);
    setSelectedLearners(new Map());
    setObserverSearch('');
    setObserverResults([]);
    setSelectedObserver(null);
    setChecklists([]);
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

  async function submit() {
    if (!selectedObserver || selectedLearners.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await bulkCreateChecklistSessions({
        checklistId: selectedChecklistId,
        learnerIds: [...selectedLearners.keys()],
        observerId: selectedObserver.id,
        scheduledAt: scheduleMode === 'later' ? new Date(scheduledAt).toISOString() : null,
        locationCapturePolicy: locationPolicy,
        timezone,
      });
      if (scheduleMode === 'now') {
        const createdIds = result.results.filter((r) => r.status === 'created' && r.sessionId).map((r) => r.sessionId!);
        await Promise.all(createdIds.map(async (sessionId) => {
          try {
            const session = await getChecklistSession(sessionId);
            await transitionChecklistSession(sessionId, 'start', session.version);
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
    } else if (step === 2 && canProceedFromScheduleStep(scheduleMode, scheduledAt)) {
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

  const selectedChecklist = checklists.find((c) => c.id === selectedChecklistId) ?? null;

  const nextDisabled = submitResult
    ? false
    : step === 0
      ? !canProceedFromParticipantsStep([...selectedLearners.keys()], selectedObserver?.id ?? '')
      : step === 1
        ? !canProceedFromChecklistStep(selectedChecklistId)
        : step === 2
          ? !canProceedFromScheduleStep(scheduleMode, scheduledAt)
          : false;

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
                        checked={selectedObserver?.id === participant.id}
                        name="observer"
                        onChange={() => setSelectedObserver(participant)}
                        type="radio"
                      />
                      {formatParticipantName(participant)}
                    </label>
                  </li>
                ))}
              </ul>

              <h3>{t('admin.checklists.sessions.wizard.learnersLabel', 'Employees')}</h3>
              <Input
                aria-label={t('admin.checklists.sessions.wizard.learnerSearch', 'Find employee')}
                onChange={(e) => setLearnerSearch(e.target.value)}
                placeholder={t('admin.checklists.sessions.wizard.learnerSearch', 'Find employee')}
                value={learnerSearch}
              />
              <p>{t('admin.checklists.sessions.wizard.learnersSelected', '{{count}} of {{max}} selected', { count: selectedLearners.size, max: MAX_BULK_SESSION_LEARNERS })}</p>
              <ul className="ds-wizard-dialog__picklist">
                {learnerResults.map((participant) => (
                  <li key={participant.id}>
                    <label>
                      <input
                        checked={selectedLearners.has(participant.id)}
                        onChange={() => toggleLearner(participant)}
                        type="checkbox"
                      />
                      {formatParticipantName(participant)}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 1 && (
            <div>
              <h3>{t('admin.checklists.sessions.wizard.checklistLabel', 'Checklist')}</h3>
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
              <label>
                <input checked={scheduleMode === 'now'} name="scheduleMode" onChange={() => setScheduleMode('now')} type="radio" />
                {t('admin.checklists.sessions.wizard.startNow', 'Start now')}
              </label>
              <label>
                <input checked={scheduleMode === 'later'} name="scheduleMode" onChange={() => setScheduleMode('later')} type="radio" />
                {t('admin.checklists.sessions.wizard.scheduleLater', 'Schedule for later')}
              </label>
              {scheduleMode === 'later' && (
                <Input
                  label={t('admin.checklists.sessions.wizard.scheduledAt', 'Date and time')}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  type="datetime-local"
                  value={scheduledAt}
                />
              )}
              <p>{t('admin.checklists.sessions.wizard.timezone', 'Timezone: {{timezone}}', { timezone })}</p>
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
                <dt>{t('admin.checklists.sessions.wizard.whenLabel', 'When')}</dt>
                <dd>{scheduleMode === 'now' ? t('admin.checklists.sessions.wizard.startNow', 'Start now') : scheduledAt}</dd>
              </dl>
            </div>
          )}
        </>
      )}
    </WizardDialog>
  );
}
