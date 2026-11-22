import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { installOffer, isInstalled, isIosBrowser, onInstallOfferChange, rememberDismissed, runInstall, wasDismissed } from './pwa.js';

/** PR 357: "Install to the home screen" for the observer; gone after installing or declining. */
export function InstallHint() {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const [hidden, setHidden] = useState(() => isInstalled() || wasDismissed());
  useEffect(() => onInstallOfferChange(() => refresh((n) => n + 1)), []);

  const offer = installOffer();
  const ios = isIosBrowser();
  if (hidden || (!offer && !ios)) return null;

  const dismiss = () => { rememberDismissed(); setHidden(true); };
  async function install() {
    const outcome = await runInstall();
    if (outcome !== 'unavailable') { rememberDismissed(); setHidden(true); }
  }

  return (
    <section aria-labelledby="install-hint-title" className="no-print" style={{ border: '1px solid currentColor', borderRadius: '0.5rem', padding: '0.75rem 1rem', margin: '0 0 1rem', display: 'grid', gap: '0.5rem' }}>
      <h2 id="install-hint-title" style={{ margin: 0, fontSize: '1rem' }}>{t('pwa.title')}</h2>
      <p style={{ margin: 0 }}>{offer ? t('pwa.androidText') : t('pwa.iosText')}</p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {offer ? <button className="ds-button ds-button--primary ds-button--md" type="button" onClick={() => void install()}>{t('pwa.install')}</button> : null}
        <button className="ds-button ds-button--secondary ds-button--md" type="button" onClick={dismiss}>{t('pwa.dismiss')}</button>
      </div>
    </section>
  );
}
