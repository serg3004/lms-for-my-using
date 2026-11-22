import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getOrganizationFeatures, saveOrganizationFeatures } from '../../shared/api/organizations.js';
import { ApiClientError, apiRequest } from '../../shared/apiClient.js';
import { Dialog } from '../../shared/ui.js';

/** PR 503: a person the dialog can write to. `invited` gets an invitation, `active` a temporary password. */
export type TelegramTarget = { id: string; firstName: string; lastName: string; middleName?: string | null; status: string };

type Channel = { configured: boolean; enabled: boolean; botUsername: string | null };
type Delivery = { id: string; kind: 'invitation' | 'temporary_password'; status: 'sent' | 'failed' | 'awaiting_start'; errorCode: string | null; createdAt: string };
type History = { linked: boolean; linkedAt: string | null; items: Delivery[] };
type Outcome = { status: 'sent' } | { status: 'failed'; reason: string } | { status: 'awaiting_start'; botLink: string; expiresAt: string };
type Loaded = { channel: Channel; history: History };

const small = { fontSize: '0.875rem' } as const;

/** Whether the row can be written to through Telegram at all. */
export function telegramKind(user: { status: string }): 'invitation' | 'temporary_password' | null {
  return user.status === 'invited' ? 'invitation' : user.status === 'active' ? 'temporary_password' : null;
}

export function TelegramSendDialog({ user, organizationId, canEnable, onClose }: { user: TelegramTarget | null; organizationId: string | null; canEnable: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const x = (key: string) => t(`telegram.${key}`);

  const load = useCallback(async (target: TelegramTarget) => {
    setLoadFailed(false);
    try {
      const [channel, history] = await Promise.all([
        apiRequest<Channel>('/users/telegram-delivery'),
        apiRequest<History>(`/users/${encodeURIComponent(target.id)}/deliveries`),
      ]);
      setData({ channel, history });
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    setData(null); setOutcome(null); setError(''); setConfirmed(false); setCopied(false); setBusy(false);
    if (user) void load(user);
  }, [user, load]);

  const kind = user ? telegramKind(user) : null;

  async function send() {
    if (!user || !kind) return;
    setBusy(true); setError(''); setOutcome(null);
    try {
      const path = kind === 'invitation' ? 'invitation' : 'temporary-password';
      setOutcome(await apiRequest<Outcome>(`/users/${encodeURIComponent(user.id)}/telegram/${path}`, { method: 'POST', body: JSON.stringify({}) }));
      setConfirmed(false);
      await load(user);
    } catch (failure) {
      const status = failure instanceof ApiClientError ? failure.status : 0;
      setError(status === 409 ? 'conflict' : status === 429 ? 'tooMany' : status === 404 ? 'notFound' : status === 403 ? 'forbidden' : 'other');
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    if (!organizationId || !user) return;
    setBusy(true); setError('');
    try {
      const current = await getOrganizationFeatures(organizationId);
      await saveOrganizationFeatures(organizationId, { ...current, telegramDeliveryEnabled: true });
      await load(user);
    } catch {
      setError('enableFailed');
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: string) {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }

  const date = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const name = user ? [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ') : '';
  const channel = data?.channel;
  const ready = Boolean(channel?.configured && channel.enabled);
  const reasonText = (code: string) => t(`telegram.reasons.${code}`, { defaultValue: x('reasons.unavailable') });

  return <Dialog open={user !== null} onClose={onClose} labelledBy={titleId} style={{ maxWidth: 520, width: 'calc(100vw - 32px)' }}>
    <h2 id={titleId}>{x('title')}</h2>
    <p style={{ marginBlock: '0 12px' }}><strong>{name}</strong></p>
    {!data && !loadFailed && <p role="status">{x('loading')}</p>}
    {loadFailed && <div role="alert"><p>{x('loadError')}</p><button className="admin-btn admin-btn--secondary" type="button" onClick={() => user && void load(user)}>{x('retry')}</button></div>}
    {data && channel && <div style={{ display: 'grid', gap: 12 }}>
      {!channel.configured && <p role="alert">{x('notConfigured')}</p>}
      {channel.configured && !channel.enabled && <div role="status">
        <p style={{ marginBlock: '0 8px' }}>{canEnable ? x('disabledAdmin') : x('disabled')}</p>
        {canEnable && <button className="admin-btn" type="button" disabled={busy} onClick={() => void enable()}>{x('enable')}</button>}
      </div>}
      {ready && kind && <>
        <p style={{ margin: 0 }}>{kind === 'invitation' ? x('invitationHint') : x('passwordHint')}</p>
        {kind === 'temporary_password' && <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>{x('passwordConfirm')}</span>
        </label>}
        <div><button className="admin-btn" type="button" disabled={busy || (kind === 'temporary_password' && !confirmed)} aria-busy={busy || undefined} onClick={() => void send()}>{busy ? x('sending') : x('send')}</button></div>
      </>}
      {error && <p role="alert">{x(error.startsWith('enable') ? error : `errors.${error}`)}</p>}
      {outcome?.status === 'sent' && <p role="status">{x('sent')}</p>}
      {outcome?.status === 'failed' && <p role="alert">{x('failed')}: {reasonText(outcome.reason)}</p>}
      {outcome?.status === 'awaiting_start' && <div role="status" style={{ display: 'grid', gap: 8 }}>
        <strong>{x('awaitingTitle')}</strong>
        <p style={{ margin: 0 }}>{x('awaitingHint')}</p>
        <label style={small}>{x('botLink')}<input readOnly value={outcome.botLink} style={{ width: '100%', boxSizing: 'border-box' }} onFocus={(event) => event.currentTarget.select()} /></label>
        <div style={small}>{x('until')}: {date(outcome.expiresAt)}</div>
        <div><button className="admin-btn admin-btn--secondary" type="button" onClick={() => void copy(outcome.botLink)}>{copied ? x('copied') : x('copy')}</button></div>
      </div>}
      <section aria-label={x('history')}>
        <h3 style={{ fontSize: '1rem', marginBlock: '0 4px' }}>{x('history')}</h3>
        <p style={{ ...small, margin: '0 0 4px' }}>{data.history.linked ? x('linked') : x('notLinked')}</p>
        {data.history.items.length === 0 ? <p style={{ ...small, margin: 0 }}>{x('historyEmpty')}</p> : <ul style={{ ...small, margin: 0, paddingInlineStart: 18 }}>
          {data.history.items.map((item) => <li key={item.id}>{date(item.createdAt)}: {t(`telegram.kinds.${item.kind}`)}, {t(`telegram.statuses.${item.status}`)}{item.errorCode ? ` (${reasonText(item.errorCode)})` : ''}</li>)}
        </ul>}
      </section>
    </div>}
    <div className="ds-dialog__actions" style={{ marginBlockStart: 16 }}>
      <button className="ds-button ds-button--secondary ds-button--md" type="button" onClick={onClose}>{x('close')}</button>
    </div>
  </Dialog>;
}
