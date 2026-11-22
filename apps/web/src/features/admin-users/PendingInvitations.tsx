import { ActivationQrSheet } from './ActivationQrSheet.js';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../../shared/apiClient.js';
import type { PaginatedResponse } from '../../shared/api/types.js';
import { TelegramSendDialog } from './TelegramSendDialog.js';
import { Badge, ConfirmDialog, DataTable, PageState, Pagination, type Column } from '../../shared/ui.js';
import { useAsyncData } from '../../shared/useAsyncData.js';

type Invitation = {
  id: string;
  canIssueActivationQr?: boolean;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  sentAt: string | null;
  sendCount: number;
  expiresAt: string | null;
  status: 'pending' | 'expired' | 'revoked' | 'unsent';
};

type SendResult = { delivered: boolean; expiresAt: string; inviteUrl?: string };
type BatchResult = { userId: string } & (
  | ({ status: 'sent' } & SendResult)
  | { status: 'notFound' | 'rateLimited' | 'failed' }
);

const keys = 'admin.users.pendingInvitations';

function nameOf(user: Invitation) {
  return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');
}

export function PendingInvitations({ organizationId = null, canEnableTelegram = false }: { organizationId?: string | null; canEnableTelegram?: boolean } = {}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const contentId = useId();
  return <section className="admin-pending-invitations" style={{ marginBlockEnd: 16 }}>
    <button className="admin-btn admin-btn--secondary" type="button" disabled={busy} aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(!open)}>
      {t(`${keys}.title`)}
    </button>
    <div id={contentId} hidden={!open} style={{ marginBlockStart: 12 }}>
      {open && <PendingInvitationsList busy={busy} setBusy={setBusy} organizationId={organizationId} canEnableTelegram={canEnableTelegram} />}
    </div>
  </section>;
}

function PendingInvitationsList({ busy, setBusy, organizationId, canEnableTelegram }: { busy: boolean; setBusy: (busy: boolean) => void; organizationId: string | null; canEnableTelegram: boolean }) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [telegramTarget, setTelegramTarget] = useState<Invitation | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);
  const [report, setReport] = useState<Array<{ user: Invitation; result: BatchResult }>>([]);
  const { state, reload } = useAsyncData(
    async (signal) => {
      try {
        return await apiRequest<PaginatedResponse<Invitation>>(`/users/invitations?page=${page}&pageSize=20`, { signal });
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 403) return null;
        throw error;
      }
    },
    [page, t],
    { unauthenticated: t('admin.users.sessionExpired'), error: t(`${keys}.loadError`) },
  );

  const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const date = (value: string | null) => value ? format.format(new Date(value)) : '—';

  async function run(action: 'resend' | 'revoke' | 'extend' | 'batch', users: Invitation[]) {
    const [user] = users;
    setBusy(true);
    setError('');
    setNotice('');
    setReport([]);
    try {
      if (action === 'batch') {
        const { items } = await apiRequest<{ items: BatchResult[] }>('/users/invitations/resend', {
          method: 'POST',
          body: JSON.stringify({ userIds: users.map(({ id }) => id) }),
        });
        const byId = new Map(items.map((result) => [result.userId, result]));
        setReport(users.map((user) => ({ user, result: byId.get(user.id) ?? { userId: user.id, status: 'failed' } })));
      } else if (action === 'resend') {
        const result = await apiRequest<SendResult>(`/users/${user.id}/invitation/resend`, { method: 'POST' });
        setReport([{ user, result: { ...result, userId: user.id, status: 'sent' } }]);
      } else {
        await apiRequest(`/users/${user.id}/invitation/${action}`, { method: 'POST' });
        setNotice(action === 'revoke' ? 'revoked' : 'extended');
      }
      setSelected(new Set());
      await reload();
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : 0;
      setError(status === 403 ? 'forbidden' : status === 404 ? 'notFound' : status === 429 ? 'rateLimited' : status === 409 ? 'noLongerPending' : 'failed');
      if (status === 404 || status === 409) await reload();
    } finally {
      setRevokeTarget(null);
      setBusy(false);
    }
  }

  const columns: Column<Invitation>[] = [
    { key: 'name', label: t('admin.users.col.name'), priority: 'primary', render: nameOf },
    { key: 'email', label: t('admin.users.col.email'), priority: 'secondary', render: (user) => user.email },
    { key: 'status', label: t('admin.users.col.status'), priority: 'primary', render: (user) =>
      <Badge variant={user.status === 'pending' ? 'info' : 'neutral'}>{t(`${keys}.states.${user.status}`)}</Badge> },
    { key: 'sentAt', label: t(`${keys}.sentAt`), priority: 'secondary', render: (user) => date(user.sentAt) },
    { key: 'sendCount', label: t(`${keys}.sendCount`), priority: 'secondary', render: (user) => user.sendCount },
    { key: 'expiresAt', label: t(`${keys}.expiresAt`), priority: 'secondary', render: (user) => date(user.expiresAt) },
    {
      key: 'actions', label: t('admin.users.col.actions'), priority: 'secondary', render: (user) =>
        <div className="admin-table-actions">
          <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" disabled={busy} onClick={() => void run('resend', [user])}>{t(`${keys}.resend`)}</button>
          <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" disabled={busy} onClick={() => setTelegramTarget(user)}>{t('telegram.action')}</button>
          {user.status === 'pending' && <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" disabled={busy} onClick={() => void run('extend', [user])}>{t(`${keys}.extend`)}</button>}
          {(user.status === 'pending' || user.status === 'expired') && <button className="admin-btn admin-btn--sm admin-btn--danger" type="button" disabled={busy} onClick={() => setRevokeTarget(user)}>{t(`${keys}.revoke`)}</button>}
        </div>,
    },
  ];

  const data = state.status === 'loaded' ? state.data : null;
  return <>
    {error && <p role="alert">{t(`${keys}.${error}`)}</p>}
    {notice && <p role="status">{t(`${keys}.${notice}`)}</p>}
    {report.length > 0 && <div>
      <h3>{t(`${keys}.results`)}</h3>
      <ul aria-live="polite">
        {report.map(({ user, result }) => <li key={user.id}>
          {nameOf(user)}. {result.status === 'sent'
            ? result.delivered
              ? t(`${keys}.delivered`, { email: user.email })
              : <>{t(`${keys}.undelivered`, { date: date(result.expiresAt) })} {result.inviteUrl && <a href={result.inviteUrl}>{t(`${keys}.openLink`)}</a>}</>
            : t(`${keys}.${result.status}`)}
        </li>)}
      </ul>
      <button className="admin-btn" type="button" onClick={() => setReport([])}>{t('admin.users.close')}</button>
    </div>}
    {state.status === 'loading' && <PageState variant="loading" message={t(`${keys}.loading`)} />}
    {'message' in state && <PageState variant="error" message={state.message} action={<button className="admin-btn" type="button" onClick={() => void reload()}>{t(`${keys}.retry`)}</button>} />}
    {state.status === 'loaded' && !data && <PageState variant="error" message={t(`${keys}.forbidden`)} />}
    {data && <>
      <DataTable columns={columns} rows={data.items} keyExtractor={(user) => user.id}
        label={t(`${keys}.title`)} emptyMessage={t(`${keys}.empty`)} density="dense"
        selection={{
          selectedKeys: selected, onChange: setSelected, isRowSelectable: () => !busy,
          selectAllLabel: t(`${keys}.selectAll`), rowLabel: (user) => t(`${keys}.selectUser`, { name: nameOf(user) }),
          selectedLabel: (count) => t(`${keys}.selected`, { count }),
        }}
        batchActions={(users) => <>{users.some((user) => user.canIssueActivationQr) && <ActivationQrSheet key={users.map(({ id }) => id).join(',')} userIds={users.filter((user) => user.canIssueActivationQr).map(({ id }) => id)} />}<button className="admin-btn" type="button" disabled={busy} onClick={() => void run('batch', users)}>
          {t(`${keys}.resendSelected`)}
        </button></>}
        responsiveDetails={{ label: t('courses.details'), expandLabel: (user) => `${t('courses.details')}: ${nameOf(user)}`, collapseLabel: (user) => `${t('courses.details')}: ${nameOf(user)}` }} />
      <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={(next) => {
        if (busy) return;
        setSelected(new Set());
        setPage(next);
      }} />
    </>}
    <TelegramSendDialog user={telegramTarget ? { ...telegramTarget, status: 'invited' } : null} organizationId={organizationId} canEnable={canEnableTelegram} onClose={() => setTelegramTarget(null)} />
    <ConfirmDialog open={revokeTarget !== null} title={t(`${keys}.revoke`)}
      message={t(`${keys}.revokeConfirm`, { name: revokeTarget ? nameOf(revokeTarget) : '' })}
      confirmLabel={t(`${keys}.revoke`)} cancelLabel={t('admin.users.cancel')} danger busy={busy}
      onConfirm={() => { if (revokeTarget) void run('revoke', [revokeTarget]); }} onCancel={() => { if (!busy) setRevokeTarget(null); }} />
  </>;
}
