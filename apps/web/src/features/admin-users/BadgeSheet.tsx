import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { getBadgeState, issueBadges, resetBadgePin, revokeBadge, type BadgeState, type IssuedBadge } from '../../shared/api/badge.js';
import { formatDate } from '../../shared/formatDate.js';
import { Dialog } from '../../shared/ui.js';
import { qrSvg } from '../admin-checklists/publicQr.js';
import { badgeLink } from '../badge/badgeToken.js';
import './activationQrSheet.css';

type Status = 'idle' | 'busy' | 'failed';
type Props = { userIds: string[]; single?: boolean };

const nameOf = (card: Pick<IssuedBadge, 'firstName' | 'lastName' | 'middleName'>) => [card.lastName, card.firstName, card.middleName].filter(Boolean).join(' ');

/**
 * PR 506: the administrator issues badges, prints the QR cards and hands each PIN over separately. The token and the PIN are
 * shown this once and are not stored anywhere readable. For one person the sheet can also revoke the badge and reset the PIN.
 */
export function BadgeSheet({ userIds, single = false }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const [cards, setCards] = useState<IssuedBadge[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [confirming, setConfirming] = useState<'issue' | 'revoke' | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [state, setState] = useState<BadgeState['badge'] | undefined>(undefined);

  async function openSheet() {
    setInfo(null);
    if (single) {
      try { setState((await getBadgeState(userIds[0]!)).badge); } catch { setState(undefined); }
    }
    setConfirming('issue');
  }

  async function issue() {
    setConfirming(null);
    setStatus('busy');
    setCards([]);
    setSkipped(0);
    try {
      const items: IssuedBadge[] = [];
      let skippedCount = 0;
      for (let start = 0; start < userIds.length; start += 20) {
        const result = await issueBadges(userIds.slice(start, start + 20));
        items.push(...result.items);
        skippedCount += result.skipped;
        setCards([...items]);
        setSkipped(skippedCount);
      }
      setStatus('idle');
    } catch {
      setStatus('failed');
    }
  }

  async function revoke() {
    setConfirming(null);
    setStatus('busy');
    try {
      await revokeBadge(userIds[0]!);
      setInfo(t('badge.admin.revoked'));
      setStatus('idle');
    } catch {
      setStatus('failed');
    }
  }

  async function reset() {
    setStatus('busy');
    setInfo(null);
    try {
      const { pin } = await resetBadgePin(userIds[0]!);
      setInfo(t('badge.admin.resetPinDone', { pin }));
      setStatus('idle');
    } catch {
      setStatus('failed');
    }
  }

  function close() {
    setConfirming(null);
    setCards([]);
    setInfo(null);
  }

  const stateText = state === undefined ? null : state === null ? t('badge.admin.stateNone')
    : state.pinLockedUntil && new Date(state.pinLockedUntil) > new Date() ? t('badge.admin.stateLocked', { time: formatDate(state.pinLockedUntil, undefined, { timeStyle: 'short', dateStyle: 'medium' }) })
    : t(`badge.admin.state${state.state === 'active' ? 'Active' : state.state === 'lost' ? 'Lost' : 'Revoked'}`);

  const sheet = cards.map((card) => {
    const url = badgeLink(card.token);
    return <article className="activation-qr-card" key={card.token}>
      <strong>{nameOf(card)}</strong>
      {card.employeeNumber ? <div>{t('badge.admin.employeeNumber')} {card.employeeNumber}</div> : null}
      <img alt={t('badge.admin.imageLabel')} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(url))}`} />
      <a href={url} target="_blank" rel="noreferrer">{t('badge.admin.openLink')}</a>
    </article>;
  });

  return <>
    <button type="button" className="admin-btn admin-btn--secondary" disabled={status === 'busy'} onClick={() => void openSheet()}>{t('badge.admin.open')}</button>
    {status === 'busy' && <p role="status">{t('badge.admin.loading')}</p>}
    {status === 'failed' && <p role="alert">{t('badge.admin.error')}</p>}
    {info && cards.length === 0 && !confirming && <p role="status">{info}</p>}
    <Dialog open={Boolean(confirming) || (cards.length > 0 && status !== 'busy')} onClose={close} labelledBy={titleId} style={{ width: 'min(46rem, calc(100vw - 2rem))' }}>
      <h2 id={titleId}>{t('badge.admin.title')}</h2>
      {confirming === 'issue' ? <>
        {stateText ? <p>{t('badge.admin.state')}: {stateText}</p> : null}
        <p>{t('badge.admin.confirm')}</p>
        <button className="admin-btn admin-btn--primary" type="button" onClick={() => void issue()}>{t('badge.admin.issue')}</button>
        {single && state?.state === 'active' ? <>
          <button className="admin-btn admin-btn--secondary" type="button" onClick={() => void reset()}>{t('badge.admin.resetPin')}</button>
          <button className="admin-btn admin-btn--danger" type="button" onClick={() => setConfirming('revoke')}>{t('badge.admin.revoke')}</button>
        </> : null}
        {info ? <p role="status">{info}</p> : null}
      </> : null}
      {confirming === 'revoke' ? <>
        <p>{t('badge.admin.revokeConfirm')}</p>
        <button className="admin-btn admin-btn--danger" type="button" onClick={() => void revoke()}>{t('badge.admin.revoke')}</button>
      </> : null}
      {!confirming && cards.length > 0 ? <>
        <p>{t('badge.admin.warning')}</p>
        <div className="activation-qr-preview">{sheet}</div>
        {createPortal(<div className="activation-qr-print" aria-hidden="true">{sheet}</div>, document.body)}
        <button className="admin-btn admin-btn--primary" type="button" onClick={() => window.print()}>{t('badge.admin.print')}</button>
        <h3>{t('badge.admin.pinsTitle')}</h3>
        <p>{t('badge.admin.pinsHint')}</p>
        <table>
          <thead><tr><th scope="col">{t('badge.admin.name')}</th><th scope="col">{t('badge.admin.pin')}</th></tr></thead>
          <tbody>{cards.map((card) => <tr key={card.userId}><td>{nameOf(card)}</td><td><code>{card.pin}</code></td></tr>)}</tbody>
        </table>
      </> : null}
      {skipped > 0 && !confirming ? <p role="status">{t('badge.admin.skipped', { count: skipped })}</p> : null}
      <button className="admin-btn admin-btn--secondary" type="button" onClick={close}>{t('badge.admin.close')}</button>
    </Dialog>
  </>;
}
