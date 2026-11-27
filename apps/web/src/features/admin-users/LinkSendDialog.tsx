import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../../shared/apiClient.js';
import { Dialog } from '../../shared/ui.js';

/** PR 572: a person the link can be sent to. */
export type LinkTarget = { id: string; firstName: string; lastName: string; middleName?: string | null };
type Channel = 'email' | 'telegram';
type Outcome = { status: 'sent' } | { status: 'failed'; reason: string } | { status: 'awaiting_start'; botLink: string; expiresAt: string };

/** Sends the link to install the app, or to one check (`sessionId`), by e-mail or through Telegram. The message carries no secret. */
export function LinkSendDialog({ user, sessionId, onClose }: { user: LinkTarget | null; sessionId?: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const [telegramReady, setTelegramReady] = useState(false);
  const [busy, setBusy] = useState<Channel | null>(null);
  const [sentBy, setSentBy] = useState<Channel | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setBusy(null); setSentBy(null); setOutcome(null); setError(''); setCopied(false); setTelegramReady(false);
    if (!user) return;
    let alive = true;
    void apiRequest<{ configured: boolean; enabled: boolean }>('/users/telegram-delivery')
      .then((status) => { if (alive) setTelegramReady(status.configured && status.enabled); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [user]);

  async function send(channel: Channel) {
    if (!user) return;
    setBusy(channel); setError(''); setOutcome(null);
    try {
      const result = await apiRequest<Outcome>(`/users/${encodeURIComponent(user.id)}/links`, { method: 'POST', body: JSON.stringify(sessionId ? { channel, sessionId } : { channel }) });
      setSentBy(channel);
      setOutcome(result);
    } catch (failure) {
      const status = failure instanceof ApiClientError ? failure.status : 0;
      const message = failure instanceof Error ? failure.message : '';
      setError(status === 429 ? 'tooMany' : status === 404 ? 'notFound' : status === 403 ? 'forbidden'
        : status === 409 ? (/mailbox/i.test(message) ? 'noMailbox' : /not configured/i.test(message) && channel === 'email' ? 'mailOff' : /not connected/i.test(message) ? 'notConnected' : 'conflict') : 'other');
    } finally {
      setBusy(null);
    }
  }

  async function copy(link: string) {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }

  const name = user ? [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ') : '';
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const errorText = (key: string) => key === 'noMailbox' || key === 'mailOff' || key === 'notConnected' ? t(`pwa.send.${key}`) : t(`telegram.errors.${key}`);

  return <Dialog open={user !== null} onClose={onClose} labelledBy={titleId} style={{ maxWidth: 520, width: 'calc(100vw - 32px)' }}>
    <h2 id={titleId}>{t(sessionId ? 'pwa.send.titleSession' : 'pwa.send.titleInstall')}</h2>
    <p style={{ marginBlock: '0 12px' }}><strong>{name}</strong></p>
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0 }}>{t('pwa.send.hint')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="admin-btn" type="button" disabled={busy !== null} aria-busy={busy === 'email' || undefined} onClick={() => void send('email')}>{busy === 'email' ? t('pwa.send.sending') : t('pwa.send.byEmail')}</button>
        {telegramReady ? <button className="admin-btn" type="button" disabled={busy !== null} aria-busy={busy === 'telegram' || undefined} onClick={() => void send('telegram')}>{busy === 'telegram' ? t('pwa.send.sending') : t('pwa.send.byTelegram')}</button> : null}
      </div>
      {error ? <p role="alert">{errorText(error)}</p> : null}
      {outcome?.status === 'sent' ? <p role="status">{sentBy === 'email' ? t('pwa.send.sentEmail') : t('pwa.send.sentTelegram')}</p> : null}
      {outcome?.status === 'failed' ? <p role="alert">{sentBy === 'email' ? t('pwa.send.failedMail') : `${t('telegram.failed')}: ${t(`telegram.reasons.${outcome.reason}`, { defaultValue: t('telegram.reasons.unavailable') })}`}</p> : null}
      {outcome?.status === 'awaiting_start' ? <div role="status" style={{ display: 'grid', gap: 8 }}>
        <strong>{t('telegram.awaitingTitle')}</strong>
        <p style={{ margin: 0 }}>{t('telegram.awaitingHint')}</p>
        <label style={{ fontSize: '0.875rem' }}>{t('telegram.botLink')}<input readOnly value={outcome.botLink} style={{ width: '100%', boxSizing: 'border-box' }} onFocus={(event) => event.currentTarget.select()} /></label>
        <div style={{ fontSize: '0.875rem' }}>{t('telegram.until')}: {date(outcome.expiresAt)}</div>
        <div><button className="admin-btn admin-btn--secondary" type="button" onClick={() => void copy(outcome.botLink)}>{copied ? t('telegram.copied') : t('telegram.copy')}</button></div>
      </div> : null}
    </div>
    <div className="ds-dialog__actions" style={{ marginBlockStart: 16 }}>
      <button className="ds-button ds-button--secondary ds-button--md" type="button" onClick={onClose}>{t('pwa.send.close')}</button>
    </div>
  </Dialog>;
}
