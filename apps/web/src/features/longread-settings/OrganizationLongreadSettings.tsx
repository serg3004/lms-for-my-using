import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getOrganizationFeatures, saveOrganizationFeatures } from '../../shared/api/organizations.js';
import { useSession } from '../../shared/session.js';
import { useAsyncData } from '../../shared/useAsyncData.js';

export function useOrganizationLongreads(onChanged?: () => Promise<void>) {
  const { currentUser } = useSession();
  const { t } = useTranslation();
  const organizationId = currentUser?.organizationId;
  const canManage = currentUser?.roles.includes('admin') ?? false;
  const { state, reload, mutate } = useAsyncData(
    () => organizationId ? getOrganizationFeatures(organizationId) : Promise.resolve({ longreadEnabled: false }),
    [organizationId],
    { error: t('longreadSettings.loadError'), unauthenticated: t('admin.lessons.sessionExpired') },
  );
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  const busy = useRef(false);

  async function change(enabled: boolean) {
    if (!organizationId || !canManage || state.status !== 'loaded' || busy.current) return;
    busy.current = true; setPending(enabled); setError(false);
    try {
      const features = await saveOrganizationFeatures(organizationId, { longreadEnabled: enabled });
      mutate(() => features);
      await onChanged?.();
    } catch { setError(true); }
    finally { busy.current = false; setPending(null); }
  }

  const enabled = state.status === 'loaded' && state.data.longreadEnabled;
  return { state, enabled, checked: pending ?? enabled, canManage, saving: pending !== null, error, change, reload };
}

export function OrganizationLongreadSettings({ feature }: { feature: ReturnType<typeof useOrganizationLongreads> }) {
  const { t } = useTranslation();
  const id = useId();
  if (!feature.canManage) return null;
  return <section className="admin-card" aria-labelledby={`${id}-title`} style={{ marginBlock: 16 }}>
    <h2 id={`${id}-title`} style={{ fontSize: 18, marginBlock: '0 8px' }}>{t('longreadSettings.title')}</h2>
    <p id={`${id}-help`}>{t('longreadSettings.help')}</p>
    {feature.state.status === 'loaded' ? <>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={feature.checked} disabled={feature.saving} aria-describedby={`${id}-help`} onChange={(event) => void feature.change(event.target.checked)} />
        {t('admin.lessons.longreadEnabled')}
      </label>
      {feature.saving && <p role="status">{t('common.saving')}</p>}
      {feature.error && <p role="alert">{t('longreadSettings.saveError')}</p>}
    </> : feature.state.status === 'loading' ? <p role="status">{t('longreadSettings.loading')}</p> : <div role="alert">
      <p>{t('longreadSettings.loadError')}</p>
      <button type="button" className="admin-btn admin-btn--secondary" onClick={() => void feature.reload()}>{t('longread.retry')}</button>
    </div>}
  </section>;
}
