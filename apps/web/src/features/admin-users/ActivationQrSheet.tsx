import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { apiRequest } from '../../shared/apiClient.js';
import { Dialog } from '../../shared/ui.js';
import { qrSvg } from '../admin-checklists/publicQr.js';
import './activationQrSheet.css';

type PersonalCard = {
  token: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  employeeNumber: string;
};
type SharedCard = { token: string };
type Props = { userIds: string[]; canRevoke?: boolean } | { departmentId?: string; shared: true };

export function ActivationQrSheet(props: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const [cards, setCards] = useState<Array<PersonalCard | SharedCard>>([]);
  const [skipped, setSkipped] = useState(0);
  const [status, setStatus] = useState<'idle' | 'busy' | 'failed' | 'revoked'>('idle');
  const [confirmation, setConfirmation] = useState<'issue' | 'revoke' | null>(null);
  const personal = 'userIds' in props;
  const title = t(personal ? 'identity.qr.personalTitle' : 'identity.qr.sharedTitle');

  async function open() {
    if (personal) {
      setConfirmation('issue');
      return;
    }
    setStatus('busy');
    try {
      const search = props.departmentId ? `?departmentId=${encodeURIComponent(props.departmentId)}` : '';
      const { token } = await apiRequest<{ token: string | null }>(`/users/activation-qr/shared${search}`);
      if (token) setCards([{ token }]);
      else setConfirmation('issue');
      setStatus('idle');
    } catch {
      setStatus('failed');
    }
  }

  async function run(action: 'issue' | 'revoke') {
    setConfirmation(null);
    setStatus('busy');
    setCards([]);
    setSkipped(0);
    try {
      if (!personal) {
        const card = await apiRequest<SharedCard>('/users/activation-qr/shared', {
          method: 'POST', body: JSON.stringify({ departmentId: props.departmentId }),
        });
        setCards([card]);
      } else if (action === 'revoke') {
        await apiRequest(`/users/${props.userIds[0]}/activation-qr`, { method: 'DELETE' });
        setStatus('revoked');
        return;
      } else {
        const items: PersonalCard[] = [];
        let skippedCount = 0;
        for (let start = 0; start < props.userIds.length; start += 20) {
          const result = await apiRequest<{ items: PersonalCard[]; skipped: number }>('/users/activation-qr/personal', {
            method: 'POST', body: JSON.stringify({ userIds: props.userIds.slice(start, start + 20) }),
          });
          items.push(...result.items);
          skippedCount += result.skipped;
          setCards([...items]);
          setSkipped(skippedCount);
        }
      }
      setStatus('idle');
    } catch {
      setStatus('failed');
    }
  }

  const sheet = cards.map((card) => {
    const url = new URL('/activate', window.location.origin);
    url.hash = `qr=${personal ? 'personal' : 'shared'}.${card.token}`;
    const svg = qrSvg(url.href);
    return <article className="activation-qr-card" key={card.token}>
      {'employeeNumber' in card ? <>
        <strong>{[card.lastName, card.firstName, card.middleName].filter(Boolean).join(' ')}</strong>
        <div>{t('identity.employeeNumber')} {card.employeeNumber}</div>
        <div>{t('identity.qr.passwordLine')} __________________</div>
      </> : <strong>{t('identity.qr.poster')}</strong>}
      <img alt={title} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />
      <a href={url.href} target="_blank" rel="noreferrer">{t('admin.users.pendingInvitations.openLink')}</a>
    </article>;
  });

  return <>
    <button type="button" className="admin-btn admin-btn--secondary" disabled={status === 'busy'} onClick={() => void open()}>{title}</button>
    {personal && props.canRevoke ? <button type="button" className="admin-btn admin-btn--secondary" disabled={status === 'busy'} onClick={() => setConfirmation('revoke')}>{t('identity.qr.revoke')}</button> : null}
    {status === 'failed' && <p role="alert">{t('identity.qr.adminError')}</p>}
    {status === 'revoked' && <p role="status">{t('identity.qr.revoked')}</p>}
    {status === 'busy' && <p role="status">{t('identity.qr.loading')}</p>}
    <Dialog open={Boolean(confirmation) || (cards.length > 0 && status !== 'busy')} onClose={() => { setConfirmation(null); setCards([]); }} labelledBy={titleId} style={{ width: 'min(46rem, calc(100vw - 2rem))' }}>
      <h2 id={titleId}>{title}</h2>
      {confirmation ? <>
        <p>{t(confirmation === 'revoke' ? 'identity.qr.confirmRevoke' : 'identity.qr.confirmRotate')}</p>
        <button className="admin-btn admin-btn--primary" type="button" onClick={() => void run(confirmation)}>{t(confirmation === 'revoke' ? 'identity.qr.revoke' : 'identity.qr.issue')}</button>
      </> : null}
      {!confirmation && cards.length > 0 ? <>
        {personal && <p>{t('identity.qr.warning')}</p>}
        <div className="activation-qr-preview">{sheet}</div>
        {createPortal(<div className="activation-qr-print" aria-hidden="true">{sheet}</div>, document.body)}
        <button className="admin-btn admin-btn--primary" type="button" onClick={() => window.print()}>{t('identity.qr.print')}</button>
        {!personal && <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setConfirmation('issue')}>{t('identity.qr.issue')}</button>}
      </> : null}
      <button className="admin-btn admin-btn--secondary" type="button" onClick={() => { setConfirmation(null); setCards([]); }}>{t('admin.users.close')}</button>
    </Dialog>
    {skipped > 0 && <p role="status">{t('identity.qr.skipped', { count: skipped })}</p>}
  </>;
}
