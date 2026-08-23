import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { getCurrentUser } from '../shared/api/auth.js';
import {
  ThemeSettings,
  fetchOrganizationThemeSettings,
  getStoredThemeSettings,
  resetOrganizationThemeSettings,
  saveOrganizationThemeSettings,
  saveThemeSettings,
  themePresets,
  uploadOrganizationThemeLogo,
} from '../shared/theme.js';
import { AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';

type ThemeField = {
  key: keyof ThemeSettings;
  label: string;
  type: 'color' | 'text';
  fullWidth?: boolean;
};

type ThemeFieldGroup = {
  title: string;
  fields: ThemeField[];
};

function getThemeFieldGroups(t: TFunction): ThemeFieldGroup[] {
  return [
    {
      title: t('admin.themeSettings.groups.colors', 'Colors'),
      fields: [
        { key: 'colorPrimary', label: t('admin.themeSettings.fields.colorPrimary', 'Primary color'), type: 'color' },
        { key: 'colorPrimaryHover', label: t('admin.themeSettings.fields.colorPrimaryHover', 'Primary hover'), type: 'color' },
        { key: 'colorBackground', label: t('admin.themeSettings.fields.colorBackground', 'Background'), type: 'color' },
        { key: 'colorSurface', label: t('admin.themeSettings.fields.colorSurface', 'Surface'), type: 'color' },
        { key: 'colorSurfaceMuted', label: t('admin.themeSettings.fields.colorSurfaceMuted', 'Muted surface'), type: 'color' },
        { key: 'colorBorder', label: t('admin.themeSettings.fields.colorBorder', 'Border'), type: 'color' },
        { key: 'colorText', label: t('admin.themeSettings.fields.colorText', 'Text'), type: 'color' },
        { key: 'colorTextMuted', label: t('admin.themeSettings.fields.colorTextMuted', 'Muted text'), type: 'color' },
      ],
    },
    {
      title: t('admin.themeSettings.groups.layout', 'Layout'),
      fields: [
        { key: 'radiusSm', label: t('admin.themeSettings.fields.radiusSm', 'Small radius'), type: 'text' },
        { key: 'radiusMd', label: t('admin.themeSettings.fields.radiusMd', 'Medium radius'), type: 'text' },
        { key: 'radiusLg', label: t('admin.themeSettings.fields.radiusLg', 'Large radius'), type: 'text' },
        { key: 'spacePage', label: t('admin.themeSettings.fields.spacePage', 'Page spacing'), type: 'text' },
        { key: 'shadowCard', label: t('admin.themeSettings.fields.shadowCard', 'Card shadow'), type: 'text', fullWidth: true },
      ],
    },
    {
      title: t('admin.themeSettings.groups.sidebar', 'Admin sidebar'),
      fields: [
        { key: 'adminSidebarBackground', label: t('admin.themeSettings.fields.adminSidebarBackground', 'Sidebar background'), type: 'color' },
        { key: 'adminSidebarText', label: t('admin.themeSettings.fields.adminSidebarText', 'Sidebar text'), type: 'color' },
        { key: 'adminSidebarTextMuted', label: t('admin.themeSettings.fields.adminSidebarTextMuted', 'Sidebar muted text'), type: 'color' },
      ],
    },
  ];
}

function getMatchingPresetId(settings: ThemeSettings) {
  const matchingPreset = themePresets.find(
    (preset) => JSON.stringify({ ...preset.settings, platformName: settings.platformName }) === JSON.stringify(settings),
  );

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
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const navItems: AdminNavItem[] = [
    { label: t('admin.themeSettings.title', 'Theme settings'), href: '/admin/appearance', isCurrent: true },
  ];

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

    if (preset) {
      syncThemeSettings({ ...preset.settings, platformName: themeSettings.platformName });
    }
  }

  useEffect(() => {
    let isActive = true;

    void getCurrentUser()
      .then(({ organizationId }) => fetchOrganizationThemeSettings(organizationId))
      .then((settings) => {
        if (!isActive) return;
        saveThemeSettings(settings);
        setThemeSettings(settings);
        setSettingsJson(getSettingsJson(settings));
        setStatusMessage('');
      })
      .catch(() => {
        if (isActive) {
          setStatusMessage(t('admin.themeSettings.loadError', 'Unable to load saved theme settings. Showing cached settings.'));
        }
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [t]);

  async function saveTheme() {
    setIsSaving(true);
    try {
      const { organizationId } = await getCurrentUser();
      const saved = await saveOrganizationThemeSettings(organizationId, themeSettings);

      syncThemeSettings(saved);
      setStatusMessage(t('admin.themeSettings.saved', 'Theme settings saved.'));
    } catch {
      setStatusMessage(t('admin.themeSettings.saveError', 'Unable to save theme settings. Try again.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function resetTheme() {
    setIsSaving(true);
    try {
      const { organizationId } = await getCurrentUser();
      const reset = await resetOrganizationThemeSettings(organizationId);

      syncThemeSettings(reset);
      setStatusMessage(t('admin.themeSettings.resetDone', 'Theme settings reset.'));
    } catch {
      setStatusMessage(t('admin.themeSettings.saveError', 'Unable to save theme settings. Try again.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function importSettings() {
    setIsSaving(true);
    try {
      const importedSettings = JSON.parse(settingsJson) as ThemeSettings;
      const { organizationId } = await getCurrentUser();
      const saved = await saveOrganizationThemeSettings(organizationId, importedSettings);

      syncThemeSettings(saved);
      setStatusMessage(t('admin.themeSettings.imported', 'Theme settings imported.'));
    } catch {
      setStatusMessage(t('admin.themeSettings.importError', 'Unable to import theme settings.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsUploadingLogo(true);
    try {
      const { organizationId } = await getCurrentUser();
      const saved = await uploadOrganizationThemeLogo(organizationId, file);

      syncThemeSettings(saved);
      setStatusMessage(t('admin.themeSettings.logoUploaded', 'Logo uploaded.'));
    } catch {
      setStatusMessage(t('admin.themeSettings.logoUploadError', 'Unable to upload the logo. Try again.'));
    } finally {
      setIsUploadingLogo(false);
    }
  }

  const logoInitial = themeSettings.platformName.trim().charAt(0).toUpperCase() || 'L';

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        eyebrow={t('admin.themeSettings.eyebrow', 'Platform branding')}
        title={t('admin.themeSettings.title', 'Theme settings')}
        subtitle={t(
          'admin.themeSettings.subtitle',
          'Tune the admin workspace colors, layout tokens, and sidebar for your organization.',
        )}
        action={
          <div className="admin-header-actions">
            <button
              className="admin-btn admin-btn--secondary"
              disabled={isLoading || isSaving}
              onClick={() => void resetTheme()}
              type="button"
            >
              {t('admin.themeSettings.reset', 'Reset')}
            </button>
            <button
              className="admin-btn admin-btn--primary"
              disabled={isLoading || isSaving}
              onClick={() => void saveTheme()}
              type="button"
            >
              {isSaving ? t('admin.themeSettings.saving', 'Saving...') : t('admin.themeSettings.save', 'Save theme')}
            </button>
          </div>
        }
      />

      {statusMessage ? (
        <p className="admin-theme-settings__status" role="status">
          {statusMessage}
        </p>
      ) : null}

      <section className="admin-theme-settings">
        <section className="admin-card">
          <h2>{t('admin.themeSettings.presetsTitle', 'Presets')}</h2>
          <p className="admin-theme-settings__hint">
            {t('admin.themeSettings.presetsHint', 'Quickly apply a ready-made color scheme on top of your current settings.')}
          </p>
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
            <fieldset className="admin-theme-settings__fieldset">
              <legend>{t('admin.themeSettings.brandingTitle', 'Branding')}</legend>
              <p className="admin-theme-settings__hint">
                {t('admin.themeSettings.brandingHint', 'Platform name and logo shown in the header and sidebar.')}
              </p>
              <label className="admin-theme-settings__field">
                {t('admin.themeSettings.fields.platformName', 'Platform name')}
                <input
                  type="text"
                  value={themeSettings.platformName}
                  onChange={(event) => updateThemeSetting('platformName', event.target.value)}
                />
              </label>
              <label className="admin-theme-settings__field">
                {t('admin.themeSettings.logoLabel', 'Logo')}
                <span className="admin-theme-settings__logo-row">
                  <span className="admin-theme-settings__logo-preview">
                    {themeSettings.logoUrl ? (
                      <img alt={t('admin.themeSettings.logoAlt', 'Organization logo')} src={themeSettings.logoUrl} />
                    ) : (
                      logoInitial
                    )}
                  </span>
                  <input
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    disabled={isLoading || isUploadingLogo}
                    onChange={(event) => void handleLogoChange(event)}
                    type="file"
                  />
                </span>
                {isUploadingLogo ? (
                  <span className="admin-theme-settings__hint">
                    {t('admin.themeSettings.logoUploading', 'Uploading logo...')}
                  </span>
                ) : null}
              </label>
            </fieldset>

            {getThemeFieldGroups(t).map((group) => (
              <fieldset className="admin-theme-settings__fieldset" key={group.title}>
                <legend>{group.title}</legend>
                <div className="admin-theme-settings__field-grid">
                  {group.fields.map((field) => {
                    const onFieldChange = (event: ChangeEvent<HTMLInputElement>) =>
                      updateThemeSetting(field.key, event.target.value);

                    return (
                      <label
                        className={
                          field.fullWidth
                            ? 'admin-theme-settings__field admin-theme-settings__field--full'
                            : 'admin-theme-settings__field'
                        }
                        key={field.key}
                      >
                        {field.label}
                        {field.type === 'color' ? (
                          <span className="admin-theme-settings__color-row">
                            <input
                              aria-hidden="true"
                              className="admin-theme-settings__color-swatch"
                              tabIndex={-1}
                              type="color"
                              value={themeSettings[field.key]}
                              onChange={onFieldChange}
                            />
                            <input
                              className="admin-theme-settings__color-hex"
                              type="text"
                              value={themeSettings[field.key]}
                              onChange={onFieldChange}
                            />
                          </span>
                        ) : (
                          <input type="text" value={themeSettings[field.key]} onChange={onFieldChange} />
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </form>

          <aside className="admin-card admin-theme-preview" aria-label={t('admin.themeSettings.previewTitle', 'Preview')}>
            <h2>{t('admin.themeSettings.previewTitle', 'Preview')}</h2>
            <div
              className="admin-theme-preview__surface"
              style={{
                background: themeSettings.colorBackground,
                borderRadius: themeSettings.radiusLg,
                padding: themeSettings.spacePage,
              }}
            >
              <div
                className="admin-theme-preview__hero"
                style={{
                  background: `linear-gradient(135deg, ${themeSettings.colorPrimary}, #7c3aed)`,
                  borderRadius: `${themeSettings.radiusMd} ${themeSettings.radiusMd} 0 0`,
                }}
              >
                <span className="admin-theme-preview__logo-chip">
                  {themeSettings.logoUrl ? (
                    <img alt="" src={themeSettings.logoUrl} />
                  ) : (
                    logoInitial
                  )}
                </span>
                <strong>{themeSettings.platformName}</strong>
              </div>

              <article
                className="admin-theme-preview__card"
                style={{
                  color: themeSettings.colorText,
                  borderColor: themeSettings.colorBorder,
                  borderRadius: `0 0 ${themeSettings.radiusMd} ${themeSettings.radiusMd}`,
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
                  {t(
                    'admin.themeSettings.previewText',
                    'Cards, controls, layout spacing, and sidebar tokens use the selected settings.',
                  )}
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
          <button className="admin-btn admin-btn--secondary" type="button" disabled={isLoading || isSaving} onClick={() => void importSettings()}>
            {t('admin.themeSettings.import', 'Import JSON')}
          </button>
        </section>
      </section>
    </AdminPageLayout>
  );
}
