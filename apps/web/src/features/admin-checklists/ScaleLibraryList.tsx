import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';

import { defaultLevelColor } from '../../shared/levelPaint.js';
import type { ChecklistScaleSummary } from '../../shared/api/types.js';
import { SearchInput } from '../../shared/ui.js';

/** The colour of a level: its own (PR 369б), else the default the server uses (best score green, zero red, between orange). */
export function scaleLevelColor(scale: ChecklistScaleSummary, index: number): string {
  const level = scale.levels[index]!;
  if (level.color) return level.color;
  const points = scale.levels.map((entry) => entry.score ?? entry.value);
  return defaultLevelColor(level.score ?? level.value, Math.max(...points));
}

/** PR 517: the library of evaluation scales: one filter line, the Active / Archive tabs and a card per scale. */
export function ScaleLibraryList({ scales, base, language, timezone, t }: {
  scales: ChecklistScaleSummary[];
  base: string;
  language: string;
  timezone: string;
  t: TFunction;
}) {
  const [search, setSearch] = useState('');
  const [descending, setDescending] = useState(false);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const archived = scales.filter((scale) => scale.status === 'archived');
  const active = scales.filter((scale) => scale.status !== 'archived');
  const term = search.trim().toLocaleLowerCase(language);
  const shown = (tab === 'active' ? active : archived)
    .filter((scale) => scale.name.toLocaleLowerCase(language).includes(term))
    .sort((a, b) => a.name.localeCompare(b.name, language) * (descending ? -1 : 1));
  const order = t(descending ? 'admin.checklists.scaleLibrary.descending' : 'admin.checklists.scaleLibrary.ascending');

  return <>
    <div className="scale-filter">
      <SearchInput label={t('admin.checklists.scaleLibrary.search')} onChange={setSearch} placeholder={t('admin.checklists.scaleLibrary.search')} value={search} />
      <button aria-label={`${t('admin.checklists.scaleLibrary.sort')}: ${order}`} className="ds-button ds-button--secondary scale-filter__sort" onClick={() => setDescending(!descending)} type="button">
        <span aria-hidden="true">{order} {descending ? '↑' : '↓'}</span>
      </button>
    </div>
    <div aria-label={t('admin.checklists.scaleLibrary.tabsLabel')} className="admin-org-tabs" role="tablist">
      {(['active', 'archived'] as const).map((value) => <button aria-selected={tab === value} className="admin-org-tabs__tab" key={value} onClick={() => setTab(value)} role="tab" type="button">
        {t(value === 'active' ? 'admin.checklists.scaleLibrary.tabActive' : 'admin.checklists.scaleLibrary.tabArchived', { count: (value === 'active' ? active : archived).length })}
      </button>)}
    </div>
    {shown.length === 0 && <p className="admin-form__hint">{t(tab === 'archived' && !term ? 'admin.checklists.scaleLibrary.archiveEmpty' : 'admin.checklists.scaleManager.empty')}</p>}
    <ul className="scale-cards">
      {shown.map((scale) => {
        const author = scale.creator ? `${scale.creator.firstName} ${scale.creator.lastName}` : t(scale.isDefault ? 'admin.checklists.scaleLibrary.system' : 'admin.checklists.scaleLibrary.unknownCreator');
        return <li className={scale.status === 'archived' ? 'scale-card scale-card--archived' : 'scale-card'} key={scale.id}>
          <Link className="scale-card__link" to={`${base}/${encodeURIComponent(scale.id)}`}>
            <span className="scale-card__head">
              <strong className="scale-card__name">
                {scale.isDefault && <span aria-label={t('admin.checklists.scaleManager.defaultBadge')} className="scale-card__lock" role="img">
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm2 0h6V8a3 3 0 0 0-6 0Z" /></svg>
                </span>}
                {scale.name}
              </strong>
              <span className="scale-card__counts">
                {t('admin.checklists.scaleManager.levelsCount', { count: scale.levels.length })} · {t('admin.checklists.scaleLibrary.usage', { count: scale.usageCount ?? 0 })}
              </span>
            </span>
            <span aria-hidden="true" className="scale-card__bars">
              {scale.levels.map((level, index) => <span className="scale-card__bar" key={level.value} style={{ background: scaleLevelColor(scale, index) }} />)}
            </span>
            <span className="scale-card__levels">
              {scale.levels.map((level, index) => <span className="scale-card__level" key={level.value}>
                <span aria-hidden="true" className="scale-card__dot" style={{ background: scaleLevelColor(scale, index) }} />{level.label}
              </span>)}
            </span>
            <span className="scale-card__meta">
              {author}
              {scale.createdAt && <> · <time dateTime={scale.createdAt} title={new Date(scale.createdAt).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone })}>{new Date(scale.createdAt).toLocaleDateString(language, { dateStyle: 'medium', timeZone: timezone })}</time></>}
              {scale.status === 'archived' && <> · <span className="scale-card__archived">{t('admin.checklists.scaleManager.archived')}</span></>}
            </span>
          </Link>
        </li>;
      })}
    </ul>
  </>;
}
