import type { AssessmentPolicy } from '@lms/shared/assessment-policy';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../shared/adminPage.js';

function localDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function AssessmentPolicyFields({ policy, onChange, legacyReveal }: {
  policy: AssessmentPolicy;
  onChange: (policy: AssessmentPolicy) => void;
  legacyReveal: boolean;
}) {
  const { t } = useTranslation();
  const label = (key: string) => t(`assessments.policy.${key}`);
  return <>
    {(['opensAt', 'closesAt'] as const).map((field) => <FormField key={field} id={field} label={label(field)}>
      <input id={field} type="datetime-local" value={localDateTime(policy[field])} onChange={(event) => {
        const date = new Date(event.target.value);
        onChange({ ...policy, [field]: Number.isFinite(date.getTime()) ? date.toISOString() : null });
      }} />
    </FormField>)}
    <FormField id="cooldownHours" label={label('cooldownHours')}>
      <input id="cooldownHours" type="number" min={0} max={2147483647} value={policy.cooldownHours ?? ''}
        onChange={(event) => onChange({ ...policy, cooldownHours: event.target.value === '' ? undefined : event.target.valueAsNumber })} />
    </FormField>
    <FormField id="attemptPolicy" label={label('attemptPolicy')}>
      <select id="attemptPolicy" value={policy.attemptPolicy ?? ''} onChange={(event) =>
        onChange({ ...policy, attemptPolicy: (event.target.value || undefined) as AssessmentPolicy['attemptPolicy'] })}>
        {['', 'best', 'latest', 'average'].map((value) => <option key={value} value={value}>{label(value || 'legacy')}</option>)}
      </select>
    </FormField>
    <FormField id="answerVisibility" label={label('answerVisibility')} hint={label('lastHint')}>
      <select id="answerVisibility" value={policy.answerVisibility ?? (legacyReveal ? 'submitted' : 'never')}
        onChange={(event) => onChange({ ...policy, answerVisibility: event.target.value as AssessmentPolicy['answerVisibility'] })}>
        {['never', 'submitted', 'last'].map((value) => <option key={value} value={value}>{label(value)}</option>)}
      </select>
    </FormField>
    <FormField id="incorrectAnswer" label={label('incorrectAnswer')} hint={label('immediateHint')}>
      <select id="incorrectAnswer" value={policy.incorrectAnswer ?? 'never'}
        onChange={(event) => onChange({ ...policy, incorrectAnswer: event.target.value as AssessmentPolicy['incorrectAnswer'],
          ...(event.target.value === 'immediate' ? { oneQuestion: true } : {}) })}>
        {['never', 'immediate', 'review'].map((value) => <option key={value} value={value}>{label(value)}</option>)}
      </select>
    </FormField>
    {(['showFeedback', 'oneQuestion', 'preventBacktracking'] as const).map((field) =>
      <label key={field} className="admin-checkbox-field">
        <input type="checkbox" checked={policy[field] ?? (field === 'oneQuestion')}
          disabled={field === 'oneQuestion' && (policy.preventBacktracking || policy.incorrectAnswer === 'immediate')}
          onChange={(event) => onChange({ ...policy, [field]: event.target.checked,
            ...((field === 'preventBacktracking' && event.target.checked) ? { oneQuestion: true } : {}) })} />
        {label(field)}
      </label>)}
  </>;
}
