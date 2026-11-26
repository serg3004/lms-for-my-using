import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { assessmentAccentContrast, assessmentFonts, assessmentThemeSchema, type AssessmentPresentation } from '@lms/shared/assessment-presentation';
import { apiRequest, getCurrentUser } from '../../shared/apiClient.js';
import { Button } from '../../shared/ui.js';
import { FormField } from '../../shared/adminPage.js';
import { RichTextField } from '../../shared/RichTextField.js';

export function AssessmentPresentationFields({ value, onChange }: {
  value: AssessmentPresentation;
  onChange: (value: AssessmentPresentation) => void;
}) {
  const { t } = useTranslation();
  const label = (key: string) => t(`assessments.presentation.${key}`);
  const [admin, setAdmin] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>();
  const theme = value.theme ?? {};
  const parsedTheme = assessmentThemeSchema.safeParse(theme);
  const accent = parsedTheme.data?.accent;
  useEffect(() => {
    let active = true;
    void getCurrentUser().then((user) => {
      if (active) setAdmin(user.roles.includes('admin'));
    }, () => {});
    return () => { active = false; };
  }, []);

  function changeTheme(update: Partial<typeof theme>) {
    setSaveStatus(undefined);
    onChange({ ...value, theme: { ...theme, ...update } });
  }

  return <>
    <label className="admin-checkbox-field">
      <input type="checkbox" checked={value.titleScreen !== false}
        onChange={(event) => onChange({ ...value, titleScreen: event.target.checked })} />
      {label('titleScreen')}
    </label>
    {value.titleScreen === false && <p>{label('noTimer')}</p>}
    <FormField id="assessment-final-screen" label={label('finalScreen')}>
      <select id="assessment-final-screen" value={value.finalScreen ?? 'results'}
        onChange={(event) => onChange({ ...value, finalScreen: event.target.value as AssessmentPresentation['finalScreen'] })}>
        {(['results', 'message', 'none'] as const).map((mode) => <option key={mode} value={mode}>{label(mode)}</option>)}
      </select>
    </FormField>
    {value.finalScreen === 'message' && <RichTextField id="assessment-completion-message" label={label('completionMessage')}
      value={value.completionMessage ?? ''} maxLength={2000}
      onChange={(completionMessage) => onChange({ ...value, completionMessage })} />}
    <FormField id="assessment-accent-picker" label={label('palette')}>
      <input id="assessment-accent-picker" type="color" value={accent ?? '#2563eb'}
        onChange={(event) => changeTheme({ accent: event.target.value })} />
    </FormField>
    <FormField id="assessment-accent" label={label('accent')} error={parsedTheme.success ? undefined : label('invalidAccent')}>
      <input id="assessment-accent" placeholder="#2563eb" maxLength={7} value={theme.accent ?? ''}
        onChange={(event) => changeTheme({ accent: event.target.value.trim() || undefined })} />
    </FormField>
    {accent && assessmentAccentContrast(accent).white < 4.5 && <p role="status">{label('contrast')}</p>}
    {(['headingFont', 'bodyFont'] as const).map((field) => <FormField key={field} id={field} label={label(field)}>
      <select id={field} value={theme[field] ?? ''} onChange={(event) =>
        changeTheme({ [field]: event.target.value || undefined })}>
        <option value="">{label('defaultFont')}</option>
        {Object.keys(assessmentFonts).map((font) => <option key={font} value={font}>{label(font)}</option>)}
      </select>
    </FormField>)}
    {admin && <Button type="button" variant="secondary" disabled={!parsedTheme.success || saveStatus === 'saving'}
      onClick={async () => {
        if (!parsedTheme.success) return;
        setSaveStatus('saving');
        try {
          await apiRequest('/assessments/default-theme', { method: 'PATCH', body: JSON.stringify(parsedTheme.data) });
          setSaveStatus('saved');
        } catch {
          setSaveStatus('error');
        }
      }}>{label('setDefault')}</Button>}
    {saveStatus === 'saved' && <p role="status">{label('defaultSaved')}</p>}
    {saveStatus === 'error' && <p role="alert">{t('admin.assessmentBuilder.saveError')}</p>}
  </>;
}
