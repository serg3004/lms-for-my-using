import { useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';

import { getChecklistWorkplaceSettings } from '../../shared/api/checklists.js';
import type { ChecklistFeedbackVisibility, ChecklistGeolocationPolicy, ChecklistModuleSettings, ChecklistWorkplaceSettingsView } from '../../shared/api/types.js';
import { HighlightColorField } from '../../shared/HighlightColorField.js';
import { Button, Select } from '../../shared/ui.js';
import { ObserverEligibilityFields } from '../admin-checklist-sessions/ObserverEligibilityFields.js';
import { ChecklistCheckboxOption } from './ChecklistHelpTip.js';

/** The sheet inherits all four groups (geolocation is kept next to the other location controls). */
export const NO_MODULE_OVERRIDES: ChecklistModuleSettings = { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null };

export const countModuleOverrides = (settings: ChecklistModuleSettings, locationPolicy: ChecklistGeolocationPolicy | '') =>
  Object.values(settings).filter((group) => group !== null).length + (locationPolicy === '' ? 0 : 1);

type Props = {
  value: ChecklistModuleSettings;
  onChange: (value: ChecklistModuleSettings) => void;
  /** PR 397: the geolocation override is the sheet's own policy; '' = as in the organization. */
  locationPolicy: ChecklistGeolocationPolicy | '';
  onResetLocation: () => void;
  disabled: boolean;
  /** Only an administrator changes who may observe a sheet (as for the organization). */
  canEditObservers: boolean;
  t: TFunction;
};

const policyLabel = (t: TFunction, policy: ChecklistGeolocationPolicy) =>
  policy === 'off' ? t('admin.checklists.settings.geolocationOff', 'Off')
    : policy === 'required' ? t('admin.checklists.settings.geolocationRequired', 'Required')
      : t('admin.checklists.settings.geolocationOptional', 'Optional');

/**
 * PR 397: per-sheet overrides of the module settings. Each group has an "As in the organization" switch (on
 * by default); switched off, it shows the same controls as the organization's settings, pre-filled from them.
 */
export function ChecklistModuleSettingsBlock({ value, onChange, locationPolicy, onResetLocation, disabled, canEditObservers, t }: Props) {
  const id = useId();
  const [org, setOrg] = useState<ChecklistWorkplaceSettingsView | null>(null);
  useEffect(() => {
    let cancelled = false;
    getChecklistWorkplaceSettings().then((settings) => { if (!cancelled) setOrg(settings && typeof settings.highPerformanceThreshold === 'number' && settings.resultColors ? settings : null); }).catch(() => { if (!cancelled) setOrg(null); });
    return () => { cancelled = true; };
  }, []);
  const [selectedUsers, setSelectedUsers] = useState<NonNullable<ChecklistWorkplaceSettingsView['selectedObserverUsers']>>([]);

  const feedbackLabel = (visibility: ChecklistFeedbackVisibility) => visibility === 'live'
    ? t('admin.checklists.settings.feedbackLive', 'As the observer records it')
    : t('admin.checklists.settings.feedbackAfterCompletion', 'After the session is completed');
  const eligibilityLabel = (eligibility: ChecklistWorkplaceSettingsView['observerEligibility']) => t(
    eligibility === 'any_user' ? 'admin.checklists.settings.observers.anyUser'
      : eligibility === 'selected_users' ? 'admin.checklists.settings.observers.selectedUsers' : 'admin.checklists.settings.observers.selectedRoles',
  );
  const inheritHint = (text: string | null) => (text === null ? '' : `${t('admin.checklists.moduleSettings.orgNow', 'In the organization now')}: ${text}`);
  const overridesCount = countModuleOverrides(value, locationPolicy);
  // Open from the start when the sheet already has its own settings; afterwards only the user opens or closes it.
  const [expanded, setExpanded] = useState(overridesCount > 0);
  const set = (patch: Partial<ChecklistModuleSettings>) => onChange({ ...value, ...patch });
  const lowOk = !value.thresholds || value.thresholds.low < value.thresholds.high;

  return (
    <details data-testid="checklist-module-settings" onToggle={(e) => setExpanded(e.currentTarget.open)} open={expanded}>
      <summary>{t('admin.checklists.moduleSettings.title', 'Module settings for this checklist')}</summary>
      <p className="admin-form__hint">
        {t('admin.checklists.moduleSettings.intro', 'By default the checklist uses the organization settings. Switch a group off “As in the organization” to set it for this checklist only.')}
      </p>

      <ChecklistCheckboxOption
        label={t('admin.checklists.moduleSettings.thresholds', 'Result thresholds: as in the organization')}
        hint={inheritHint(org ? `${org.highPerformanceThreshold}% / ${org.lowThreshold === null ? '—' : `${org.lowThreshold}%`}` : null)}
        checked={value.thresholds === null}
        disabled={disabled}
        onChange={(inherit) => set({ thresholds: inherit ? null : { high: org?.highPerformanceThreshold ?? 90, low: org?.lowThreshold ?? Math.min(50, (org?.highPerformanceThreshold ?? 90) - 1) } })}
      />
      {value.thresholds && (
        <div className="admin-form__field">
          <label htmlFor={`${id}-high`}>{t('admin.checklists.settings.highPerformanceThreshold', 'High-performance threshold')}</label>
          <input disabled={disabled} id={`${id}-high`} max={100} min={0} onChange={(e) => set({ thresholds: { ...value.thresholds!, high: Number(e.target.value) } })} type="number" value={value.thresholds.high} />
          <label htmlFor={`${id}-low`}>{t('admin.checklists.settings.lowThreshold', 'Low-result threshold')}</label>
          <input aria-describedby={`${id}-low-error`} aria-invalid={!lowOk} disabled={disabled} id={`${id}-low`} max={100} min={0} onChange={(e) => set({ thresholds: { ...value.thresholds!, low: Number(e.target.value) } })} type="number" value={value.thresholds.low} />
          {!lowOk && <p className="learner-quiz__submit-error" id={`${id}-low-error`} role="alert">{t('admin.checklists.settings.thresholdOrderError', 'The low threshold must be below the high-performance threshold.')}</p>}
        </div>
      )}

      <ChecklistCheckboxOption
        label={t('admin.checklists.moduleSettings.colors', 'Result colours: as in the organization')}
        hint={inheritHint(org ? `${org.resultColors.low} / ${org.resultColors.mid} / ${org.resultColors.high}` : null)}
        checked={value.resultColors === null}
        disabled={disabled}
        onChange={(inherit) => set({ resultColors: inherit ? null : { ...(org?.resultColors ?? { low: '#C62828', mid: '#F9A825', high: '#2E7D32' }) } })}
      />
      {value.resultColors && (
        <fieldset className="admin-form__field" style={{ minWidth: 0 }}>
          <legend>{t('admin.checklists.settings.resultColors.title', 'Result colours')}</legend>
          {(['low', 'mid', 'high'] as const).map((band) => (
            <div className="admin-form__field" key={band}>
              <HighlightColorField
                disabled={disabled}
                label={t(`admin.checklists.settings.resultColors.${band}Label`, band)}
                onChange={(color) => set({ resultColors: { ...value.resultColors!, [band]: color } })}
                value={value.resultColors![band]}
              />
            </div>
          ))}
        </fieldset>
      )}

      <div className="admin-form__field">
        <p>
          <strong>{t('admin.checklists.moduleSettings.geolocation', 'Geolocation')}:</strong>{' '}
          {locationPolicy === ''
            ? `${t('admin.checklists.moduleSettings.asOrg', 'As in the organization')}${org ? ` (${policyLabel(t, org.defaultGeolocationPolicy)})` : ''}`
            : policyLabel(t, locationPolicy)}
        </p>
        <p className="admin-form__hint">{t('admin.checklists.moduleSettings.geolocationHint', 'Set with “Record location” above.')}</p>
        {locationPolicy !== '' && <Button disabled={disabled} onClick={onResetLocation} type="button" variant="secondary">{t('admin.checklists.moduleSettings.resetOne', 'As in the organization')}</Button>}
      </div>

      <ChecklistCheckboxOption
        label={t('admin.checklists.moduleSettings.feedback', 'Feedback visibility: as in the organization')}
        hint={inheritHint(org ? feedbackLabel(org.feedbackVisibility) : null)}
        checked={value.feedbackVisibility === null}
        disabled={disabled}
        onChange={(inherit) => set({ feedbackVisibility: inherit ? null : org?.feedbackVisibility ?? 'after_completion' })}
      />
      {value.feedbackVisibility && (
        <Select
          disabled={disabled}
          label={t('admin.checklists.settings.feedbackVisibility', 'When learners see session feedback')}
          onChange={(e) => set({ feedbackVisibility: e.target.value as ChecklistFeedbackVisibility })}
          value={value.feedbackVisibility}
        >
          <option value="after_completion">{feedbackLabel('after_completion')}</option>
          <option value="live">{feedbackLabel('live')}</option>
        </Select>
      )}

      <ChecklistCheckboxOption
        label={t('admin.checklists.moduleSettings.observers', 'Who may observe: as in the organization')}
        hint={canEditObservers
          ? inheritHint(org ? eligibilityLabel(org.observerEligibility) : null)
          : t('admin.checklists.moduleSettings.observersAdminOnly', 'Only an administrator can change who may observe this checklist.')}
        checked={value.observers === null}
        disabled={disabled || !canEditObservers}
        onChange={(inherit) => set({ observers: inherit ? null : { eligibility: org?.observerEligibility ?? 'selected_roles', roles: org?.observerRoles ?? ['instructor', 'manager', 'admin'], userIds: org?.observerUserIds ?? [] } })}
      />
      {value.observers && canEditObservers && org && (
        <ObserverEligibilityFields
          onChange={(patch) => {
            if (patch.selectedObserverUsers) setSelectedUsers(patch.selectedObserverUsers);
            set({
              observers: {
                eligibility: patch.observerEligibility ?? value.observers!.eligibility,
                roles: patch.observerRoles ?? value.observers!.roles,
                userIds: patch.observerUserIds ?? value.observers!.userIds,
              },
            });
          }}
          settings={{ ...org, observerEligibility: value.observers.eligibility, observerRoles: value.observers.roles, observerUserIds: value.observers.userIds, selectedObserverUsers: selectedUsers }}
          t={t}
        />
      )}

      {overridesCount > 0 && (
        <Button disabled={disabled} onClick={() => { onChange({ ...NO_MODULE_OVERRIDES, observers: canEditObservers ? null : value.observers }); onResetLocation(); }} type="button" variant="secondary">
          {t('admin.checklists.moduleSettings.resetAll', 'Reset all: as in the organization')}
        </Button>
      )}
    </details>
  );
}
