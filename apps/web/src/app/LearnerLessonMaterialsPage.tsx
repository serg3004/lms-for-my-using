import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  CourseMaterialSummary,
  LessonSummary,
  getLesson,
  getMaterialDownloadUrl,
  listCourseMaterials,
} from '../shared/apiClient.js';
import { getLessonHref } from '../shared/learnerRoutes.js';
import { PageState } from '../shared/ui.js';

type LessonMaterialsLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; lesson: LessonSummary; materials: CourseMaterialSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

const COLORS = {
  bg: '#f4f7fb',
  surface: '#ffffff',
  soft: '#f8fafc',
  text: '#172033',
  muted: '#6b7280',
  border: '#e3e8ef',
  primary: '#4f46e5',
  warningSoft: '#fff7e8',
  warningText: '#8a4b05',
};

type MaterialType = 'pdf' | 'video' | 'link' | 'file';

function materialType(material: CourseMaterialSummary): MaterialType {
  if (material.kind === 'link') return 'link';
  if (material.mimeType?.startsWith('video/')) return 'video';
  if (material.mimeType === 'application/pdf') return 'pdf';
  return 'file';
}

function materialIcon(type: MaterialType): string {
  if (type === 'video') return '▶';
  if (type === 'link') return '↗';
  return 'PDF';
}

function formatSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function LearnerLessonMaterialsPage({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LessonMaterialsLoadState>({ status: 'idle' });
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | MaterialType>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadLessonMaterials() {
      setLoadState({ status: 'loading' });

      try {
        const lesson = await getLesson(lessonId);
        const courseMaterials = await listCourseMaterials(lesson.courseId);
        const lessonMaterials = courseMaterials.filter((material) => material.lessonId === lesson.id);

        if (isMounted) {
          setLoadState({ status: 'loaded', lesson, materials: lessonMaterials });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({ status: 'unauthenticated', message: t('materials.sessionExpired') });
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState({ status: 'notFound', message: t('materials.notFound') });
          return;
        }

        setLoadState({ status: 'error', message: t('materials.loadError') });
      }
    }

    void loadLessonMaterials();

    return () => {
      isMounted = false;
    };
  }, [lessonId, t]);

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const coursesAction = <a href="/learn/courses">{t('courses.navLink')}</a>;

  const filtered = useMemo(() => {
    if (loadState.status !== 'loaded') return [];
    const q = query.trim().toLowerCase();
    return loadState.materials.filter((material) => {
      const matchesQuery = !q || material.title.toLowerCase().includes(q);
      const matchesType = typeFilter === 'all' || materialType(material) === typeFilter;
      return matchesQuery && matchesType;
    });
  }, [loadState, query, typeFilter]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return <PageState message={t('materials.loading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <PageState title={t('materials.title')} message={loadState.message} variant="error" action={loginAction} />
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <PageState title={t('materials.title')} message={loadState.message} variant="error" action={coursesAction} />
    );
  }

  async function handleDownload(materialId: string) {
    setDownloadError(null);
    setDownloadingId(materialId);
    // Open the tab synchronously, inside the click handler, so browsers still treat it as
    // user-initiated -- opening it only after the await below (once the presigned URL comes
    // back) risks the popup blocker treating it as an unrequested new tab.
    const newTab = window.open('', '_blank');
    if (newTab) {
      newTab.opener = null;
    }
    try {
      const { url } = await getMaterialDownloadUrl(materialId);
      if (newTab) {
        newTab.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener');
      }
    } catch {
      newTab?.close();
      setDownloadError(t('materials.downloadError'));
    } finally {
      setDownloadingId(null);
    }
  }

  const { lesson, materials } = loadState;
  const downloadableCount = materials.filter((m) => m.kind === 'file').length;
  const onlineCount = materials.filter((m) => m.kind === 'link' || materialType(m) === 'video').length;

  return (
    <>
      <div style={{ marginBottom: '22px' }}>
        <div
          style={{
            color: COLORS.primary,
            fontSize: '12px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '8px',
          }}
        >
          {t('materials.eyebrow')}
        </div>
        <h1 style={{ margin: 0, fontSize: '38px', fontWeight: 800, color: COLORS.text, lineHeight: 1.2 }}>
          {t('materials.title')}
        </h1>
        <p style={{ margin: '10px 0 0', color: COLORS.muted, fontSize: '15px', maxWidth: '760px', lineHeight: 1.6 }}>
          {t('materials.subtitleFor', { lesson: lesson.title })}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(320px,.75fr)', gap: '22px', alignItems: 'start' }}>
        <article
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '20px',
            boxShadow: '0 8px 24px rgba(23,32,51,.05)',
            padding: '24px',
          }}
        >
          <h2 style={{ margin: '0 0 18px', fontSize: '20px', color: COLORS.text }}>{t('materials.availableTitle')}</h2>

          {downloadError ? (
            <div
              role="alert"
              style={{
                marginBottom: '14px',
                padding: '12px 14px',
                borderRadius: '12px',
                background: COLORS.warningSoft,
                color: COLORS.warningText,
                fontSize: '13px',
              }}
            >
              {downloadError}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('materials.searchPlaceholder')}
              style={{
                flex: 1,
                minWidth: '220px',
                border: `1px solid ${COLORS.border}`,
                background: COLORS.soft,
                borderRadius: '12px',
                padding: '11px 13px',
              }}
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | MaterialType)}
              style={{ border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 13px' }}
            >
              <option value="all">{t('materials.filterAll')}</option>
              <option value="pdf">{t('materials.filterPdf')}</option>
              <option value="video">{t('materials.filterVideo')}</option>
              <option value="link">{t('materials.filterLink')}</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '42px 20px',
                border: `1px dashed ${COLORS.border}`,
                borderRadius: '16px',
                color: COLORS.muted,
              }}
            >
              {t('materials.empty')}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '14px' }}>
              {filtered.map((material) => {
                const type = materialType(material);
                const size = formatSize(material.sizeBytes);

                return (
                  <article
                    key={material.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '54px minmax(0,1fr) auto',
                      gap: '14px',
                      alignItems: 'center',
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '15px',
                      padding: '16px',
                    }}
                  >
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '15px',
                        display: 'grid',
                        placeItems: 'center',
                        background: '#eef2ff',
                        color: COLORS.primary,
                        fontWeight: 900,
                      }}
                    >
                      {materialIcon(type)}
                    </div>
                    <div>
                      <h3 style={{ margin: '0 0 5px', fontSize: '17px', color: COLORS.text }}>{material.title}</h3>
                      {material.description ? (
                        <p style={{ margin: 0, color: COLORS.muted, fontSize: '13px', lineHeight: 1.5 }}>
                          {material.description}
                        </p>
                      ) : null}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                        <span style={badgeStyle}>{t(`materials.filter${capitalize(type)}`)}</span>
                        {size ? <span style={badgeStyle}>{size}</span> : null}
                        <span style={badgeStyle}>
                          {material.kind === 'link' ? t('materials.online') : t('materials.downloadable')}
                        </span>
                      </div>
                    </div>
                    {material.kind === 'link' ? (
                      <a
                        href={material.fileUrl ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={actionButtonStyle}
                      >
                        {t('materials.actionOpen')}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleDownload(material.id)}
                        disabled={downloadingId === material.id}
                        style={{
                          ...actionButtonStyle,
                          cursor: downloadingId === material.id ? 'progress' : 'pointer',
                          opacity: downloadingId === material.id ? 0.7 : 1,
                        }}
                      >
                        {downloadingId === material.id ? t('materials.downloading') : t('materials.actionDownload')}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </article>

        <aside style={{ display: 'grid', gap: '18px', position: 'sticky', top: '98px' }}>
          <section
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '20px',
              boxShadow: '0 8px 24px rgba(23,32,51,.05)',
              padding: '24px',
            }}
          >
            <h3 style={{ margin: '0 0 18px', fontSize: '18px', color: COLORS.text }}>{t('materials.summaryTitle')}</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={summaryRowStyle}>
                <span style={{ color: COLORS.muted }}>{t('materials.summaryTotal')}</span>
                <strong>{materials.length}</strong>
              </div>
              <div style={{ ...summaryRowStyle, borderBottom: 'none', paddingBottom: 0 }}>
                <span style={{ color: COLORS.muted }}>{t('materials.summaryDownloadable')}</span>
                <strong>{downloadableCount}</strong>
              </div>
              <div style={{ ...summaryRowStyle, borderBottom: 'none', paddingBottom: 0 }}>
                <span style={{ color: COLORS.muted }}>{t('materials.summaryOnline')}</span>
                <strong>{onlineCount}</strong>
              </div>
            </div>
          </section>

          <section
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '20px',
              boxShadow: '0 8px 24px rgba(23,32,51,.05)',
              padding: '24px',
            }}
          >
            <div style={{ padding: '14px', borderRadius: '14px', background: COLORS.warningSoft, color: COLORS.warningText, fontSize: '13px', lineHeight: 1.55 }}>
              {t('materials.note')}
            </div>
          </section>

          <section
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '20px',
              boxShadow: '0 8px 24px rgba(23,32,51,.05)',
              padding: '24px',
            }}
          >
            <a
              href={getLessonHref(lesson.id)}
              style={{
                display: 'block',
                textAlign: 'center',
                border: `1px solid ${COLORS.primary}`,
                background: COLORS.primary,
                color: '#fff',
                borderRadius: '12px',
                padding: '11px 14px',
                fontWeight: 800,
                fontSize: '14px',
                textDecoration: 'none',
              }}
            >
              {t('materials.actionBack')}
            </a>
          </section>
        </aside>
      </div>
    </>
  );
}

const actionButtonStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.primary}`,
  background: COLORS.primary,
  color: '#fff',
  borderRadius: '12px',
  padding: '11px 14px',
  fontWeight: 800,
  fontSize: '14px',
  fontFamily: 'inherit',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  padding: '6px 9px',
  borderRadius: '999px',
  background: COLORS.soft,
  color: COLORS.muted,
  fontSize: '11px',
  fontWeight: 800,
};

const summaryRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  paddingBottom: '12px',
  borderBottom: `1px solid ${COLORS.border}`,
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
