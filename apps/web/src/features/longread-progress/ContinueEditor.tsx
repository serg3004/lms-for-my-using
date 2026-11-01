import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { continueContentSchema } from '@lms/shared/longread-progress';
export function ContinueEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (content: Record<string, unknown>) => void }) {
  const { t } = useTranslation(), id = useId(); const value = { ...continueContentSchema.parse({}), ...content };
  return <div>
    <p>{t('longreadProgress.editorHelp')}</p>
    <label htmlFor={`${id}-mode`}>{t('longreadProgress.mode')}</label>
    <select id={`${id}-mode`} value={String(value.mode)} onChange={(e) => onChange({ ...value, mode: e.target.value })}>{['free', 'answered', 'correct'].map((mode) => <option key={mode} value={mode}>{t(`longreadProgress.modes.${mode}`)}</option>)}</select>
    <label htmlFor={`${id}-time`}>{t('longreadProgress.minimumTime')}</label>
    <input id={`${id}-time`} type="number" min={0} max={86400} value={Number.isFinite(value.minViewSeconds) ? Number(value.minViewSeconds) : ''} onChange={(e) => onChange({ ...value, minViewSeconds: e.target.valueAsNumber })} />
  </div>;
}
