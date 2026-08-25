import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getManagerTeamSummary, type ManagerTeamMember, type ManagerTeamSummary } from '../shared/api/manager.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';
import { Badge, PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type ManagerTeamData = { summary: ManagerTeamSummary };

type StatusFilter = 'all' | 'good' | 'risk';

function memberName(member: ManagerTeamMember) {
  return [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
}

export function ManagerTeamPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { state } = useAsyncData<ManagerTeamData>(
    async () => ({ summary: await getManagerTeamSummary() }),
    [t],
    { unauthenticated: t('manager.team.loadError'), error: t('manager.team.loadError') },
  );

  const filtered = useMemo(() => {
    const members = state.status === 'loaded' ? state.data.summary.members : [];
    const q = search.trim().toLowerCase();
    return members.filter((member) => {
      const matchesSearch = !q || memberName(member).toLowerCase().includes(q) || member.email.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || member.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [state, search, statusFilter]);

  if (state.status === 'loading') {
    return (
      <ManagerPageLayout>
        <PageState message={t('manager.team.loading')} variant="loading" />
      </ManagerPageLayout>
    );
  }

  if (state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') {
    return (
      <ManagerPageLayout>
        <PageState message={t('manager.team.loadError')} variant="error" />
      </ManagerPageLayout>
    );
  }

  return (
    <ManagerPageLayout>
      <div style={{ marginBottom: '22px' }}>
        <div style={{ color: 'var(--color-primary)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>
          {t('manager.team.eyebrow')}
        </div>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,36px)', fontWeight: 800 }}>{t('manager.team.title')}</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)' }}>{t('manager.team.subtitle')}</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder={t('manager.team.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ds-input"
          style={{ flex: 1, minWidth: '220px' }}
        />
        <select className="ds-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={{ maxWidth: '200px' }}>
          <option value="all">{t('manager.team.filterAll')}</option>
          <option value="good">{t('manager.team.filterGood')}</option>
          <option value="risk">{t('manager.team.filterRisk')}</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        <table aria-label={t('manager.team.title')}>
          <thead>
            <tr>
              <th>{t('manager.team.columnEmployee')}</th>
              <th>{t('manager.team.columnActiveCourses')}</th>
              <th>{t('manager.team.columnProgress')}</th>
              <th>{t('manager.team.columnStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((member) => (
              <tr key={member.userId}>
                <td>{memberName(member)}</td>
                <td>{member.activeCoursesCount}</td>
                <td>{member.completionPercent}%</td>
                <td>
                  <Badge variant={member.status === 'good' ? 'done' : 'overdue'}>
                    {member.status === 'good' ? t('manager.team.filterGood') : t('manager.team.filterRisk')}
                  </Badge>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }}>
                  {t('manager.team.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ManagerPageLayout>
  );
}
