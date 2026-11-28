import { useEffect, useState, type FormEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { downloadQrSvg, qrSvg } from '../../features/admin-checklists/publicQr.js';
import { getAssessmentPath } from '../../shared/api/assessments.js';
import { listDepartments } from '../../shared/api/departments.js';
import { listUsers } from '../../shared/api/users.js';
import { apiRequest } from '../../shared/apiClient.js';

import { StandaloneAssessmentResults } from './StandaloneAssessmentResults.js';
import { StandaloneAssignGrants } from './StandaloneAssignGrants.js';

type Target = 'user' | 'group' | 'department';
type Option = { id: string; name: string };

async function loadOptions(target: Target): Promise<Option[]> {
  if (target === 'group') return apiRequest<Option[]>('/groups');
  if (target === 'department') return (await listDepartments({ status: 'active', pageSize: 100 })).items;
  const result = await listUsers({ pageSize: 100 });
  return result.items.map((user) => ({ id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email }));
}

export function StandaloneAssessmentDialog({ assessment, dialog }: {
  assessment: { id: string; title: string };
  dialog: RefObject<HTMLDialogElement | null>;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<Target>('user');
  const [targetId, setTargetId] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [dueAt, setDueAt] = useState('');
  const [link, setLink] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const root = `${getAssessmentPath(assessment.id)}/standalone`;

  useEffect(() => {
    let active = true;
    void loadOptions(target).then((rows) => { if (active) setOptions(rows); })
      .catch(() => { if (active) setFeedback(t('assessments.standalone.error')); });
    return () => { active = false; };
  }, [target, t]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await apiRequest<{ assigned: number }>(`${root}/assignments`, {
        method: 'POST', body: JSON.stringify({ target, targetId, dueAt: new Date(dueAt).toISOString() }),
      });
      setFeedback(t('assessments.standalone.assigned', { count: result.assigned }));
    } catch {
      setFeedback(t('assessments.standalone.error'));
    } finally {
      setBusy(false);
    }
  }

  async function updateLink(enable: boolean) {
    setBusy(true);
    try {
      const { token } = await apiRequest<{ token: string | null }>(`${root}/link`, { method: enable ? 'POST' : 'DELETE' });
      setLink(token ? new URL(`/learn/assessments/${encodeURIComponent(assessment.id)}/take?token=${encodeURIComponent(token)}`, window.location.origin).href : '');
      setFeedback(t(enable ? 'assessments.standalone.linkReady' : 'assessments.standalone.linkRevoked'));
    } catch {
      setFeedback(t('assessments.standalone.error'));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <header className="admin-dialog__header">
      <h2>{assessment.title}</h2>
      <button type="button" className="admin-dialog__close" aria-label={t('admin.assessmentBuilder.close')} onClick={() => dialog.current?.close()}>×</button>
    </header>
    <form onSubmit={(event) => void assign(event)}>
      <label className="admin-field">{t('assessments.standalone.target')}
        <select value={target} onChange={(event) => {
          setTarget(event.target.value as Target);
          setTargetId('');
          setOptions([]);
        }}>
          {(['user', 'group', 'department'] as const).map((type) => <option key={type} value={type}>{t(`assessments.standalone.${type}`)}</option>)}
        </select>
      </label>
      <label className="admin-field">{t('assessments.standalone.recipient')}
        <select required value={targetId} onChange={(event) => setTargetId(event.target.value)}>
          <option value="">{t('assessments.standalone.choose')}</option>
          {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="admin-field">{t('assessments.standalone.due')}
        <input required type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
      </label>
      <button type="submit" className="admin-btn" disabled={busy || !targetId}>{t('assessments.standalone.assign')}</button>
    </form>
    <div className="td-actions">
      <button type="button" className="admin-btn" disabled={busy} onClick={() => void updateLink(true)}>{t('assessments.standalone.rotate')}</button>
      <button type="button" className="admin-btn" disabled={busy} onClick={() => void updateLink(false)}>{t('assessments.standalone.revoke')}</button>
    </div>
    {link && <>
      <label className="admin-field">{t('assessments.standalone.link')}
        <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
      </label>
      <img width={144} height={144} alt={t('assessments.standalone.qr')} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(link))}`} />
      <button type="button" className="admin-btn" onClick={() => downloadQrSvg(link, assessment.title)}>{t('assessments.standalone.qr')}</button>
    </>}
    <StandaloneAssignGrants root={root} />
    <StandaloneAssessmentResults assessmentId={assessment.id} />
    {feedback && <p role="status">{feedback}</p>}
  </>;
}
