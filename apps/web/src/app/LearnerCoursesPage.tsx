import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listCourses } from '../shared/api/courses.js';
import { ApiClientError } from '../shared/apiClient.js';
import type { CourseSummary } from '../shared/api/types.js';
import { Badge, Button, PageState, ProgressBar } from '../shared/ui.js';
import '../styles/ui.css';

type TabId = 'all' | 'active' | 'completed';

const COVER_GRADIENTS = [
  'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
  'linear-gradient(135deg, #059669 0%, #0284c7 100%)',
  'linear-gradient(135deg, #d97706 0%, #ea580c 100%)',
  'linear-gradient(135deg, #ea580c 0%, #db2777 100%)',
  'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
  'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
];

function coverGradient(index: number) {
  return COVER_GRADIENTS[index % COVER_GRADIENTS.length];
}

function statusBadge(status: string): { variant: 'published' | 'done' | 'warning' | 'neutral'; label: string } {
  if (status === 'published') return { variant: 'published', label: 'Активен' };
  if (status === 'archived') return { variant: 'neutral', label: 'Архив' };
  return { variant: 'neutral', label: 'Черновик' };
}

type CoursesLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; courses: CourseSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

export function LearnerCoursesPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<CoursesLoadState>({ status: 'idle' });
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoadState({ status: 'loading' });
      try {
        const courses = await listCourses();
        if (isMounted) setLoadState({ status: 'loaded', courses });
      } catch (error) {
        if (!isMounted) return;
        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({ status: 'unauthenticated', message: t('courses.sessionExpired') });
          return;
        }
        setLoadState({ status: 'error', message: t('courses.loadError') });
      }
    }

    void load();
    return () => { isMounted = false; };
  }, [t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return <PageState message={t('courses.loading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <PageState
        title={t('courses.title')}
        message={loadState.message}
        variant="error"
        action={<a href="/login">{t('login.navLink')}</a>}
      />
    );
  }

  if (loadState.status === 'error') {
    return <PageState title={t('courses.title')} message={loadState.message} variant="error" />;
  }

  const { courses } = loadState;

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'all', label: t('courses.tabs.all', 'Все'), count: courses.length },
    {
      id: 'active',
      label: t('courses.tabs.active', 'Активные'),
      count: courses.filter((c) => c.status === 'published').length,
    },
    {
      id: 'completed',
      label: t('courses.tabs.completed', 'Архив'),
      count: courses.filter((c) => c.status === 'archived').length,
    },
  ];

  const filtered = courses.filter((c) => {
    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'active' && c.status === 'published') ||
      (activeTab === 'completed' && c.status === 'archived');
    const q = search.toLowerCase();
    const matchesSearch = !q || c.title.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  return (
    <>
      {/* Page header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 4px', color: 'var(--color-text)' }}>
          {t('courses.title')}
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-muted)' }}>
          {t('courses.activeCount', { count: courses.filter((c) => c.status === 'published').length })}
        </p>
      </div>

      {/* Search + filter toolbar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="ds-search" style={{ width: '260px', flexShrink: 0 }}>
          <span className="ds-search__icon" aria-hidden="true">⌕</span>
          <input
            className="ds-search__input"
            placeholder={t('courses.searchPlaceholder', 'Поиск курсов...')}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'secondary'}
            size="sm"
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label} ({tab.count})
          </Button>
        ))}
      </div>

      {/* Course grid */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            color: 'var(--color-text-muted)',
            fontSize: '15px',
          }}
        >
          {t('courses.empty')}
        </div>
      ) : (
        <div className="course-grid">
          {filtered.map((course, index) => {
            const { variant, label } = statusBadge(course.status);
            return (
              <a
                key={course.id}
                href={`/learn/courses/${encodeURIComponent(course.id)}`}
                className="course-card"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="course-card__cover" style={{ background: coverGradient(index) }}>
                  <span className="course-card__cover-title">{course.title.slice(0, 24).toUpperCase()}</span>
                </div>
                <div className="course-card__body">
                  <h2 className="course-card__title">{course.title}</h2>
                  {course.description ? (
                    <p className="course-card__description">
                      {course.description.length > 120
                        ? `${course.description.slice(0, 120)}…`
                        : course.description}
                    </p>
                  ) : null}
                  <div className="course-card__progress">
                    <ProgressBar value={0} size="sm" />
                    <span className="course-card__progress-label">
                      {t('courses.notStarted', 'Не начат')}
                    </span>
                  </div>
                </div>
                <div className="course-card__footer">
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    {t('courses.lessons', '— уроков')}
                  </span>
                  <Badge variant={variant}>{label}</Badge>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
