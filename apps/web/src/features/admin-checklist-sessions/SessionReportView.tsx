import { useEffect, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';

import { getChecklistItemPhotoUrl } from '../../shared/api/checklists.js';
import type { ChecklistReportHighlight, ChecklistReportPerson, ChecklistSessionReport } from '../../shared/api/types.js';
import { formatDate } from '../../shared/formatDate.js';
import { formatParticipantName } from './domain.js';

/**
 * PR 371: the summary and criteria tabs of the session report. Everything shown here comes from the
 * server report (PR 370): scores, percentages, numbering and the ready fill/text colours. Nothing is
 * calculated or coloured on the client. Colour is never the only carrier of meaning: every highlighted
 * row also carries a symbol and a text label. Colours are applied as inline values, not CSS classes.
 */

type Report = ChecklistSessionReport;
type ReportCriterion = Report['criteria'][number];

const muted = { color: '#6b7280', fontSize: 13 } as const;
const gridColumns = (min: number) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }) as const;

/** The painted look of one highlighted row: soft fill, readable text and a coloured stripe on the left. */
export function highlightedRowStyle(color: ChecklistReportHighlight | null) {
  if (!color) return { border: '1px solid #e3e8ef' };
  return {
    background: color.light.fill,
    color: color.light.text,
    border: '1px solid #e3e8ef',
    borderLeft: `6px solid ${color.color}`,
  };
}

export type CriterionStatus = 'full' | 'partial' | 'zero' | 'skipped' | 'unanswered';

export function criterionStatus(criterion: Pick<ReportCriterion, 'state' | 'score' | 'maxScore'>): CriterionStatus {
  if (criterion.state === 'skipped') return 'skipped';
  if (criterion.state !== 'answered') return 'unanswered';
  const score = criterion.score ?? 0;
  if (score <= 0) return 'zero';
  return criterion.maxScore !== null && score >= criterion.maxScore ? 'full' : 'partial';
}

const STATUS_SYMBOL: Record<CriterionStatus, string> = { full: '✓', partial: '⚠', zero: '✕', skipped: '–', unanswered: '•' };

function statusLabel(status: CriterionStatus, t: TFunction) {
  if (status === 'full') return t('admin.checklists.report.statusFull', 'Full score');
  if (status === 'partial') return t('admin.checklists.report.statusPartial', 'Partial score');
  if (status === 'zero') return t('admin.checklists.report.statusZero', 'No points');
  if (status === 'skipped') return t('admin.checklists.report.criterionSkipped', 'Skipped');
  return t('admin.checklists.report.criterionUnanswered', 'No answer');
}

function personLine(person: ChecklistReportPerson) {
  const name = formatParticipantName(person);
  return person.department ? `${name}, ${person.department.name}` : name;
}

function formatPeriod(start: string | null, end: string | null, timeZone: string) {
  const options = { dateStyle: 'medium', timeStyle: 'short', timeZone } as const;
  if (start && end) return `${formatDate(start, undefined, options)} — ${formatDate(end, undefined, options)}`;
  if (start) return formatDate(start, undefined, options);
  return '—';
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="admin-card" style={{ marginBottom: 16 }}>
      {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
      {children}
    </div>
  );
}

/** Big result figure: the arc is drawn in the range colour chosen by the owner, the numbers stay as text. */
function ResultArc({ percentage, color }: { percentage: number | null; color: ChecklistReportHighlight | null }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const filled = percentage === null ? 0 : (Math.min(100, Math.max(0, percentage)) / 100) * circumference;
  return (
    <svg aria-hidden height={104} viewBox="0 0 104 104" width={104}>
      <circle cx={52} cy={52} fill="none" r={radius} stroke="#e3e8ef" strokeWidth={10} />
      {percentage !== null && (
        <circle
          cx={52} cy={52} fill="none" r={radius} stroke={color?.color ?? '#6b7280'} strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round" strokeWidth={10} transform="rotate(-90 52 52)"
        />
      )}
      <text dominantBaseline="central" fill="currentColor" fontSize={22} fontWeight={700} textAnchor="middle" x={52} y={52}>
        {percentage === null ? '—' : `${percentage}%`}
      </text>
    </svg>
  );
}

function ReportHeader({ report, t }: { report: Report; t: TFunction }) {
  const { header } = report;
  return (
    <Card>
      <dl style={{ ...gridColumns(240), margin: 0 }}>
        <div>
          <dt style={muted}>{t('admin.checklists.report.periodActual', 'Actual period')}</dt>
          <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{formatPeriod(header.startedAt, header.completedAt, header.timezone)}</dd>
        </div>
        <div>
          <dt style={muted}>{t('admin.checklists.report.periodPlanned', 'Planned period')}</dt>
          <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{formatPeriod(header.scheduledStart, header.scheduledEnd, header.timezone)}</dd>
        </div>
        <div>
          <dt style={muted}>{t('admin.checklists.sessions.columns.learner', 'Employee')}</dt>
          <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{personLine(header.learner)}</dd>
        </div>
        <div>
          <dt style={muted}>{t('admin.checklists.sessions.columns.observer', 'Observer')}</dt>
          <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{personLine(header.observer)}</dd>
        </div>
        <div>
          <dt style={muted}>{t('admin.checklists.report.timezone', 'Time zone')}</dt>
          <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{header.timezone}</dd>
        </div>
      </dl>
    </Card>
  );
}

function ReportTotal({ summary, t }: { summary: NonNullable<Report['summary']>; t: TFunction }) {
  const allSkipped = summary.criteriaCount > 0 && summary.answeredCount === 0 && summary.skippedCount === summary.criteriaCount;
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <ResultArc color={summary.color} percentage={summary.scored ? summary.percentage : null} />
        <div>
          <p style={{ ...muted, margin: 0 }}>{t('admin.checklists.report.finalResult', 'Final result')}</p>
          {summary.scored && summary.percentage !== null ? (
            <p style={{ margin: '6px 0', fontSize: 22, fontWeight: 700, color: 'var(--color-text)' }}>
              {t('admin.checklists.report.totalLine', '{{percent}}% — {{earned}} of {{max}} points across {{count}} criteria', {
                percent: summary.percentage, earned: summary.totalScore, max: summary.maxScore, count: summary.criteriaCount,
              })}
            </p>
          ) : (
            <p style={{ margin: '6px 0', fontSize: 22, fontWeight: 700, color: 'var(--color-text)' }}>
              {allSkipped ? t('admin.checklists.report.notScoredAllSkipped', 'Not scored (all skipped)') : '—'}
            </p>
          )}
          {summary.scored && summary.passed !== null && (
            <p style={{ margin: 0, fontWeight: 600 }}>{summary.passed ? t('checklists.passed', 'Passed') : t('checklists.notPassed', 'Not passed')}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function ReportFeedback({ feedback, t }: { feedback: NonNullable<Report['feedback']>; t: TFunction }) {
  const entries: Array<[string, string | null]> = [
    [t('checklistSessions.conduct.strengths', 'Strengths'), feedback.strengths],
    [t('checklistSessions.conduct.developmentAreas', 'Development areas'), feedback.developmentAreas],
    [t('admin.checklists.report.feedbackComment', 'Comment'), feedback.comment],
  ];
  return (
    <Card title={t('admin.checklists.report.feedbackTitle', 'Feedback')}>
      <dl style={{ ...gridColumns(220), margin: 0 }}>
        {entries.map(([label, value]) => (
          <div key={label}>
            <dt style={muted}>{label}</dt>
            <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function ReportGroups({ groups, t }: { groups: Report['groups']; t: TFunction }) {
  if (groups.length === 0) return null;
  return (
    <Card title={t('admin.checklists.report.groupsTitle', 'Results by criteria group')}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {groups.map((group) => (
          <li key={group.id ?? group.number} style={{ ...highlightedRowStyle(group.color), borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <strong>{group.number}. {group.title}</strong>
              <span>
                {group.percentage === null
                  ? t('admin.checklists.report.groupNotScored', 'Not scored')
                  : t('admin.checklists.report.groupScore', '{{percent}}% — {{earned}} of {{max}}', { percent: group.percentage, earned: group.score, max: group.maxScore })}
              </span>
            </div>
            <div aria-hidden style={{ background: '#ffffff', borderRadius: 4, height: 8, marginTop: 8, overflow: 'hidden' }}>
              <div style={{ background: group.color?.color ?? '#6b7280', height: '100%', width: `${group.percentage ?? 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ReportSummary({ report, t }: { report: Report; t: TFunction }) {
  return (
    <>
      <ReportHeader report={report} t={t} />
      {report.generalInfo.length > 0 && (
        <Card title={t('checklistSessions.conduct.contextTitle', 'General information')}>
          <dl style={{ ...gridColumns(220), margin: 0 }}>
            {report.generalInfo.map((field) => (
              <div key={field.id}>
                <dt style={muted}>{field.label}</dt>
                <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{field.value || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      {!report.visible || !report.summary ? (
        <Card>
          <p style={{ margin: 0 }}>{t('admin.checklists.report.hiddenResult', 'The result will be shown once the feedback rules allow it.')}</p>
        </Card>
      ) : (
        <>
          {report.header.status !== 'completed' && (
            <p style={{ ...muted, margin: '0 0 12px' }}>{t('admin.checklists.report.notFinished', 'The session is not finished yet: the result is not final.')}</p>
          )}
          <ReportTotal summary={report.summary} t={t} />
          {report.feedback && <ReportFeedback feedback={report.feedback} t={t} />}
          <ReportGroups groups={report.groups} t={t} />
        </>
      )}
    </>
  );
}

/** Thumbnail of the criterion's photo; the signed link is requested once the row is shown. */
function CriterionPhoto({ instanceId, itemId, fileName, t }: { instanceId: string; itemId: string; fileName: string | null; t: TFunction }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getChecklistItemPhotoUrl(instanceId, itemId).then((response) => { if (active) setUrl(response.url); }).catch(() => undefined);
    return () => { active = false; };
  }, [instanceId, itemId]);
  const label = t('admin.checklists.report.photoOpen', 'Open photo');
  if (!url) return <span style={{ fontSize: 12 }}>{fileName ?? label}</span>;
  return (
    <a href={url} rel="noreferrer" target="_blank" title={label}>
      <img alt={fileName ?? label} height={48} src={url} style={{ borderRadius: 6, objectFit: 'cover' }} width={64} />
    </a>
  );
}

export function ReportCriteria({ report, t }: { report: Report; t: TFunction }) {
  if (!report.visible) {
    return <p>{t('admin.checklists.report.hiddenResult', 'The result will be shown once the feedback rules allow it.')}</p>;
  }
  if (report.criteria.length === 0) return <p>{t('admin.checklists.report.criteriaEmpty', 'This checklist has no criteria.')}</p>;

  const groupTitles = new Map(report.groups.map((group) => [group.id, `${group.number}. ${group.title}`]));
  let previousGroup: string | null | undefined;
  const rows: ReactNode[] = [];
  for (const criterion of report.criteria) {
    if (criterion.groupId !== previousGroup) {
      previousGroup = criterion.groupId;
      if (criterion.groupId !== null) {
        rows.push(
          <tr key={`group-${criterion.groupId}`}>
            <th colSpan={4} scope="colgroup" style={{ textAlign: 'left', padding: '12px 8px 4px' }}>{groupTitles.get(criterion.groupId)}</th>
          </tr>,
        );
      }
    }
    const status = criterionStatus(criterion);
    const fill = criterion.color ? { background: criterion.color.light.fill, color: criterion.color.light.text } : {};
    const cell = { padding: 8, verticalAlign: 'top', ...fill } as const;
    rows.push(
      <tr key={criterion.id}>
        <td style={{ ...cell, borderLeft: `6px solid ${criterion.color?.color ?? '#e3e8ef'}` }}>
          <strong>{criterion.number}</strong> <span>{criterion.text}</span>
        </td>
        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
          <span aria-hidden>{STATUS_SYMBOL[status]} </span>
          {criterion.score === null || criterion.maxScore === null
            ? statusLabel(status, t)
            : t('admin.checklists.report.scoreOf', '{{earned}} of {{max}}', { earned: criterion.score, max: criterion.maxScore })}
          <span style={{ display: 'block', fontSize: 12 }}>{statusLabel(status, t)}</span>
        </td>
        <td style={cell}>{criterion.levelLabel ?? '—'}</td>
        <td style={cell}>
          {criterion.comment || '—'}
          {criterion.photo && (
            <div style={{ marginTop: 6 }}>
              <CriterionPhoto fileName={criterion.photo.fileName} instanceId={report.instanceId} itemId={criterion.id} t={t} />
            </div>
          )}
        </td>
      </tr>,
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: '0 6px', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th scope="col" style={{ padding: 8 }}>{t('admin.checklists.report.columnCriterion', 'Criterion')}</th>
            <th scope="col" style={{ padding: 8 }}>{t('admin.checklists.report.columnScore', 'Score')}</th>
            <th scope="col" style={{ padding: 8 }}>{t('admin.checklists.report.columnLevel', 'Scale level')}</th>
            <th scope="col" style={{ padding: 8 }}>{t('admin.checklists.report.columnComment', 'Comment')}</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}
