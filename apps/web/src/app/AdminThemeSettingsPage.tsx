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

type ThemeFieldGroup = {
  title: string;
  fields: ThemeField[];
};

const themeFieldGroups: ThemeFieldGroup[] = [
  {
    title: 'Colors',
    fields: [
      { key: 'colorPrimary', label: 'Primary color', type: 'color' },
      { key: 'colorPrimaryHover', label: 'Primary hover', type: 'color' },
      { key: 'colorBackground', label: 'Background', type: 'color' },
      { key: 'colorSurface', label: 'Surface', type: 'color' },
      { key: 'colorSurfaceMuted', label: 'Muted surface', type: 'color' },
      { key: 'colorBorder', label: 'Border', type: 'color' },
      { key: 'colorText', label: 'Text', type: 'color' },
      { key: 'colorTextMuted', label: 'Muted text', type: 'color' },
    ],
  },
  {
    title: 'Layout',
    fields: [
      { key: 'radiusSm', label: 'Small radius', type: 'text' },
      { key: 'radiusMd', label: 'Medium radius', type: 'text' },
      { key: 'radiusLr', label: 'Large radius', type: 'text' },
      { key: 'spacePage', label: 'Page spacing', type: 'text' },
      { key: 'shadowCard', label: 'Card shadow', type: 'text' },
    ],
  },
  {
    title: 'Admin sidebar',
    fields: [
      { key: 'adminSidebarBackground', label: 'Sidebar background', type: 'color' },
      { key: 'adminSidebarText', label: 'Sidebar text', type: 'color' },
      { key: 'adminSidebarTextMuted', label: 'Sidebar muted text', type: 'color' },
    ],
  },
];

function getMatchingPresetId(settings: ThemeSettings) {
  const matchingPreset = themePresets.find((preset) => JSON.stringify(preset.settings) === JSON.stringify(settings));

  return matchingPreset?.id ?? 'custom';
}

function getSettingsJson(settings: ThemeSettings) {
  return JSON.stringify(settings, null, 2);
}

export function AdminThemeSettingsPage() {
  const { t } = useTranslation();
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => getStoredThemeSettings());
  const [statusMessage, setStatusMessage] = useState('');
  const [settingsJson, setSettingsJson] = useState(() => getSettingsJson(getStoredThemeSettings()));

  const selectedPresetId = getMatchingPresetId(themeSettings);

  function syncThemeSettings(settings: ThemeSettings) {
    setThemeSettings(settings);
    setSettingsJson(getSettingsJson(settings));
    setStatusMessage('');
  }

  function updateThemeSetting(key: keyof ThemeSettings, value: string) {
    syncThemeSettings({
      ...themeSettings,
      [key]: value,
    });
  }

  function applyPreset(presetId: string) {
    const preset = themePresets.find((themePreset) => themePreset.id === presetId);

    if (!preset) {
      return;
    }

    syncThemeSettings(preset.settings);
  }

  function saveTheme() {
    saveThemeSettings(themeSettings);
    setStatusMessage(t('admin.themeSettings.saved', 'Theme settings saved locally.'));
  }

  function resetTheme() {
    resetThemeSettings();
    syncThemeSettings(defaultThemeSettings);
    setStatusMessage(t('admin.themeSettings.resetDone', 'Theme settings reset.'));
  }

  function importSettings() {
    try {
      const importedSettings = JSON.parse(settingsJson) as ThemeSettings;

      saveThemeSettings(importedSettings);
      setThemeSettings(getStoredThemeSettings());
      setSettingsJson(getSettingsJson(getStoredThemeSettings()));
      setStatusMessage(t('admin.themeSettings.imported', 'Theme settings imported.'));
    } catch {
      setStatusMessage(t('admin.themeSettings.importError', 'Unable to import theme settings.'));
    }
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
                'Tune the admin workspace colors, layout tokens, and sidebar locally without changing organization data.',
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
          <form className="admin-card admin-theme-settings__form" onSubmit={(event) => event.preventDefault()}>
            {themeFieldGroups.map((group) => (
              <fieldset className="admin-theme-settings__fieldset" key={group.title}>
                <legend>{group.title}</legend>
                {group.fields.map((field) => (
                  <label className="admin-theme-settings__field" key={field.key}>
                    {field.label}
                    <input
                      type={field.type}
                      value={themeSettings[field.key]}
                      onChange={(event) => updateThemeSetting(field.key, event.target.value)}
                    />
                  </label>
                ))}
              </fieldset>
            ))}
          </form>

          <aside className="admin-card admin-theme-preview" aria-label={t('admin.themeSettings.previewTitle', 'Preview')}>
            <h2>{t('admin.themeSettings.previewTitle', 'Preview')}</h2>
            <div
              className="admin-theme-preview__surface"
              style={{
                color: themeSettings.colorText,
                background: themeSettings.colorBackground,
                borderRadius: themeSettings.radiusLg,
                padding: themeSettings.spacePage,
              }}
            >
              <article
                className="admin-theme-preview__card"
                style={{
                  borderColor: themeSettings.colorBorder,
                  borderRadius: themeSettings.radiusMd,
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
                  {t('admin.themeSettings.previewText', 'Cards, controls, layout spacing, and sidebar tokens use the selected settings.')}
                </p>
                <button
                  type="button"
                  style={{
                    borderRadius: themeSettings.radiusSm,
                    background: themeSettings.colorPrimary,
                  }}
                >
                  {t('admin.themeSettings.previewAction', 'Primary action')}
                </button>
              </article>

              <aside
                className="admin-theme-preview__sidebar"
                style={{
                  color: themeSettings.adminSidebarText,
                  background: themeSettings.adminSidebarBackground,
                  borderRadius: themeSettings.radiusMd,
                }}
              >
                <strong>{t('admin.themeSettings.sidebarPreviewTitle', 'Sidebar')}</strong>
                <span style={{ color: themeSettings.adminSidebarTextMuted }}>
                  {t('admin.themeSettings.sidebarPreviewText', 'Navigation text')}
                </span>
              </aside>
            </div>
          </aside>
        </section>

        <section className="admin-card admin-theme-settings__json">
          <h2>{t('admin.themeSettings.jsonTitle', 'Import / export')}</h2>
          <label>
            {t('admin.themeSettings.jsonLabel', 'Theme JSON')}
            <textarea value={settingsJson} rows={10} onChange={(event) => setSettingsJson(event.target.value)} />
          </label>
          <button type="button" onClick={importSettings}>
            {t('admin.themeSettings.import', 'Import JSON')}
          </button>
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
