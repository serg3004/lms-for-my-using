import { useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import { getChecklistWorkplaceSettings, updateChecklistWorkplaceSettings } from '../../shared/api/checklists.js';
import type { ChecklistFeedbackVisibility, ChecklistGeolocationPolicy, ChecklistWorkplaceSettingsView } from '../../shared/api/types.js';
import { Button, Dialog, Select } from '../../shared/ui.js';

/**
 * Module-wide settings (PR 286), matching the prototype's `#settingsDrawer`: opened contextually
 * from the sessions screen, not a top-level nav item or route. DEC-CHKS-001 (docs/status/
 * OPEN_DECISIONS.md) is why criticalThreshold has no field here -- what counts as a "critical"
 * result is an unresolved product decision. lowThreshold (PR 350) is editable; empty means "not set".
 */
export function ChecklistWorkplaceSettingsDialog({ open, onClose, t }: { open: boolean; onClose: () => void; t: TFunction }) {
  const titleId = useId();
  const [settings, setSettings] = useState<ChecklistWorkplaceSettingsView | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    getChecklistWorkplaceSettings()
      .then(setSettings)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t('admin.checklists.settings.loadError', 'Unable to load settings.')));
  }, [open, t]);

  async function save() {
    if (!settings) return;
    if (settings.lowThreshold !== null && settings.lowThreshold > settings.highPerformanceThreshold) {
      setError(t('admin.checklists.settings.thresholdOrderError', 'The low threshold must not be above the high-performance threshold.'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateChecklistWorkplaceSettings({
        moduleEnabled: settings.moduleEnabled,
        highPerformanceThreshold: settings.highPerformanceThreshold,
        lowThreshold: settings.lowThreshold,
        defaultGeolocationPolicy: settings.defaultGeolocationPolicy,
        feedbackVisibility: settings.feedbackVisibility,
      });
      setSettings(updated);
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('admin.checklists.settings.saveError', 'Unable to save settings.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} open={open}>
      <h2 id={titleId}>{t('admin.checklists.settings.title', 'Workplace-training settings')}</h2>
      {error && <p className="learner-quiz__submit-error" role="alert">{error}</p>}
      {settings ? (
        <>
          <div className="admin-form__field">
            <label>
              <input
                checked={settings.moduleEnabled}
                onChange={(e) => setSettings({ ...settings, moduleEnabled: e.target.checked })}
                type="checkbox"
              />
              {' '}{t('admin.checklists.settings.moduleEnabled', 'Module enabled for this organization')}
            </label>
          </div>
          <div className="admin-form__field">
            <label htmlFor={`${titleId}-high`}>{t('admin.checklists.settings.highPerformanceThreshold', 'High-performance threshold')}</label>
            <input
              id={`${titleId}-high`}
              max={100}
              min={0}
              onChange={(e) => setSettings({ ...settings, highPerformanceThreshold: Number(e.target.value) })}
              type="number"
              value={settings.highPerformanceThreshold}
            />
          </div>
          <div className="admin-form__field">
            <label htmlFor={`${titleId}-low`}>{t('admin.checklists.settings.lowThreshold', 'Low-result threshold')}</label>
            <input
              aria-describedby={`${titleId}-low-hint`}
              id={`${titleId}-low`}
              max={100}
              min={0}
              onChange={(e) => setSettings({ ...settings, lowThreshold: e.target.value === '' ? null : Number(e.target.value) })}
              type="number"
              value={settings.lowThreshold ?? ''}
            />
            <p className="admin-form__hint" id={`${titleId}-low-hint`}>
              {t('admin.checklists.settings.lowThresholdHint', 'Results below this percentage count as low. Leave empty to not set a threshold.')}
            </p>
          </div>
          <Select
            label={t('admin.checklists.settings.defaultGeolocationPolicy', 'Default geolocation policy')}
            onChange={(e) => setSettings({ ...settings, defaultGeolocationPolicy: e.target.value as ChecklistGeolocationPolicy })}
            value={settings.defaultGeolocationPolicy}
          >
            <option value="optional">{t('admin.checklists.settings.geolocationOptional', 'Optional')}</option>
            <option value="required">{t('admin.checklists.settings.geolocationRequired', 'Required')}</option>
            <option value="off">{t('admin.checklists.settings.geolocationOff', 'Off')}</option>
          </Select>
          <Select
            label={t('admin.checklists.settings.feedbackVisibility', 'When learners see session feedback')}
            onChange={(e) => setSettings({ ...settings, feedbackVisibility: e.target.value as ChecklistFeedbackVisibility })}
            value={settings.feedbackVisibility}
          >
            <option value="after_completion">{t('admin.checklists.settings.feedbackAfterCompletion', 'After the session is completed')}</option>
            <option value="live">{t('admin.checklists.settings.feedbackLive', 'As the observer records it')}</option>
          </Select>
        </>
      ) : (
        !error && <p className="admin-form__hint">{t('admin.checklists.settings.loading', 'Loading settings…')}</p>
      )}
      <div className="ds-dialog__actions">
        <Button disabled={saving} onClick={onClose} type="button" variant="secondary">{t('admin.checklists.cancel', 'Cancel')}</Button>
        <Button disabled={saving || !settings} onClick={() => void save()} type="button" variant="primary">
          {t('admin.checklists.save', 'Save')}
        </Button>
      </div>
    </Dialog>
  );
}
