import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ThemeSettings,
  defaultThemeSettings,
  getStoredThemeSettings,
  resetThemeSettings,
  saveThemeSettings,
  themePresets,
} from '../shared/theme.js';
import '../styles/admin.css';

type ThemeField = {
  key: keyof ThemeSettings;
  label: string;
  type: 'color' | 'text';
};

const themeFields: ThemeField[] = [
  { key: 'colorPrimary', label: 'Primary color', type: 'color' },
  { key: 'colorPrimaryHover', label: 'Primary hover', type: 'color' },
  { key: 'colorBackground', label: 'Background', type: 'color' },
  { key: 'colorSurface', label: 'Surface', type: 'color' },
  { key: 'colorSurfaceMuted', label: 'Muted surface', type: 'color' },
  { key: 'colorBorder', label: 'Border', type: 'color' },
  { key: 'colorText', label: 'Text', type: 'color' },
  { key: 'colorTextMuted', label: 'Muted text', type: 'color' },
  { key: 'shadowCard', label: 'Card shadow', type: 'text' },
];

function getMatchingPresetId(settings: ThemeSettings) {
  const matchingPreset = themePresets.find((preset) => JSON.stringify(preset.settings) === JSON.stringify(settings));

  return matchingPreset?.id ?? 'custom';
}

export function AdminThemeSettingsPage() {
  const { t } = useTranslation();
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => getStoredThemeSettings());
  const [statusMessage, setStatusMessage] = useState('');

  const selectedPresetId = getMatchingPresetId(themeSettings);

  function updateThemeSetting(key: keyof ThemeSettings, value: string) {
    setThemeSettings((currentSettings) => ({
      ...currentSettings,
      [key]: value,
    }));
    setStatusMessage('');
  }

  function applyPreset(presetId: string) {
    const preset = themePresets.find((themePreset) => themePreset.id === presetId);

    if (!preset) {
      return;
    }

    setThemeSettings(preset.settings);
    setStatusMessage('');
  }

  function saveTheme() {
    saveThemeSettings(themeSettings);
    setStatusMessage(t('admin.themeSettings.saved', 'Theme settings saved locally.'));
  }

  function resetTheme() {
    resetThemeSettings();
    setThemeSettings(defaultThemeSettings);
    setStatusMessage(t('admin.themeSettings.resetDone', 'Theme settings reset.'));
  }

  return (
    <main>
      <section className="admin-theme-settings">
        <header className="admin-theme-settings__header">
          <div>
            <h1>{t('admin.themeSettings.title', 'Theme settings')}</h1>
            <p>
              {t(
                'admin.themeSettings.subtitle',
                'Tune the admin workspace colors locally without changing organization data.',
              )}
            </p>
          </div>
          <a href="/admin">{t('admin.themeSettings.backToAdmin', 'Back to admin')}</a>
        </header>

        <section className="admin-card">
          <h2>{t('admin.themeSettings.presetsTitle', 'Presets')}</h2>
          <label>
            {t('admin.themeSettings.presetLabel', 'Theme preset')}
            <select value={selectedPresetId} onChange={(event) => applyPreset(event.target.value)}>
              {themePresets.map((preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">{t('admin.themeSettings.customPreset', 'Custom')}</option>
            </select>
          </label>
        </section>

        <section className="admin-theme-settings__grid">
          <form className="admin-card admin-theme-settings__form">
            <h2>{t('admin.themeSettings.colorsTitle', 'Theme tokens')}</h2>
            {themeFields.map((field) => (
              <label className="admin-theme-settings__field" key={field.key}>
                {field.label}
                <input
                  type={field.type}
                  value={themeSettings[field.key]}
                  onChange={(event) => updateThemeSetting(field.key, event.target.value)}
                />
              </label>
            ))}
          </form>

          <aside className="admin-card admin-theme-preview" aria-label={t('admin.themeSettings.previewTitle', 'Preview')}>
            <h2>{t('admin.themeSettings.previewTitle', 'Preview')}</h2>
            <div
              className="admin-theme-preview__surface"
              style={{
                color: themeSettings.colorText,
                background: themeSettings.colorBackground,
              }}
            >
              <article
                className="admin-theme-preview__card"
                style={{
                  borderColor: themeSettings.colorBorder,
                  background: themeSettings.colorSurface,
                  boxShadow: themeSettings.shadowCard,
                }}
              >
                <span
                  className="admin-theme-preview__badge"
                  style={{
                    color: themeSettings.colorPrimary,
                    background: themeSettings.colorSurfaceMuted,
                  }}
                >
                  {t('admin.themeSettings.previewBadge', 'Admin')}
                </span>
                <h3>{t('admin.themeSettings.previewHeading', 'Workspace preview')}</h3>
                <p style={{ color: themeSettings.colorTextMuted }}>
                  {t('admin.themeSettings.previewText', 'Cards, controls, and muted text use the selected tokens.')}
                </p>
                <button
                  type="button"
                  style={{
                    background: themeSettings.colorPrimary,
                  }}
                >
                  {t('admin.themeSettings.previewAction', 'Primary action')}
                </button>
              </article>
            </div>
          </aside>
        </section>

        <footer className="admin-theme-settings__actions">
          <button type="button" onClick={saveTheme}>
            {t('admin.themeSettings.save', 'Save theme')}
          </button>
          <button type="button" className="admin-theme-settings__secondary-action" onClick={resetTheme}>
            {t('admin.themeSettings.reset', 'Reset')}
          </button>
          {statusMessage ? <p role="status">{statusMessage}</p> : null}
        </footer>
      </section>
    </main>
  );
}
