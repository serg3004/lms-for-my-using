import { LibrarySwitch } from '../features/checklist-feedback/LibrarySwitch.js';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminPageHeader, AdminPageLayout, ChecklistsTabs, ConfirmDialog } from '../shared/adminPage.js';
import { ObserverPageLayout } from '../shared/observerLayout.js';
import { useSession } from '../shared/session.js';
import { Button, PageState, SearchInput } from '../shared/ui.js';
import { ApiClientError } from '../shared/apiClient.js';
import { archiveChecklistScale, copyChecklistScale, createChecklistScale, deleteChecklistScale, getChecklistScale, listChecklistScales, updateChecklistScale } from '../shared/api/checklists.js';
import type { ChecklistScaleSummary } from '../shared/api/types.js';
import { ScaleEditor, newScaleEditor, scaleEditorFor, scaleDraftErrorText, type ScaleEditorState } from '../features/admin-checklists/ScaleEditor.js';
import { scaleDraftToInput, validateScaleDraft } from '../features/admin-checklists/domain.js';
import { ObserverSessionsNav } from './ObserverSessionsNav.js';

export function ChecklistScalesPage({ observer = false }: { observer?: boolean }) {
  const { t, i18n } = useTranslation(), { currentUser } = useSession();
  const { scaleId } = useParams<{ scaleId: string }>(), navigate = useNavigate(), location = useLocation();
  const roles = currentUser?.roles ?? [];
  const canRead = roles.some((role) => ['admin', 'manager', 'instructor', 'mentor'].includes(role));
  const canManage = !observer && roles.some((role) => ['admin', 'manager'].includes(role));
  const base = observer ? roles.includes('instructor') ? '/instructor/checklists/scales' : '/mentor/scales' : '/admin/checklists/scales';
  const [scales, setScales] = useState<ChecklistScaleSummary[]>([]), [scale, setScale] = useState<ChecklistScaleSummary | null>(null);
  const [editor, setEditor] = useState<ScaleEditorState | null>(null), [search, setSearch] = useState(''), [descending, setDescending] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  const title = t('admin.checklists.scaleManager.title');
  const message = (cause: unknown) => t(cause instanceof ApiClientError && cause.status === 403 ? 'admin.checklists.scaleLibrary.forbidden' : cause instanceof ApiClientError && cause.status === 404 ? 'admin.checklists.scaleLibrary.notFound' : cause instanceof ApiClientError && cause.status === 409 ? 'admin.checklists.scaleManager.inUse' : 'admin.checklists.scaleManager.error');
  useEffect(() => {
    let active = true; setError(''); setScale(null); setEditor(null); setLoading(true);
    if (!canRead || (scaleId === 'new' && !canManage)) { setLoading(false); return; }
    if (scaleId === 'new') { setEditor(newScaleEditor()); setLoading(false); return; }
    const load = scaleId ? getChecklistScale(scaleId) : listChecklistScales();
    void load.then((value) => {
      if (!active) return;
      if (Array.isArray(value)) setScales(value);
      else { setScale(value); setEditor({ ...scaleEditorFor(value), inUse: value.inUse || (value.usageCount ?? 0) > 0, readOnly: value.isDefault || value.status === 'archived' || !canManage, viewOnly: !canManage }); }
    }).catch((cause) => { if (active) setError(message(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Translations do not control the lifetime of an unsaved draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaleId, retry, canRead, canManage]);

  async function mutate(operation: () => Promise<unknown>) {
    if (busy || !canManage) return;
    setBusy(true); setError('');
    try { await operation(); } catch (cause) {
      setError(message(cause));
      if (cause instanceof ApiClientError && cause.status === 409 && scaleId) {
        try { setScale(await getChecklistScale(scaleId)); } catch { /* Keep the current draft and the original conflict. */ }
      }
    } finally { setBusy(false); }
  }
  function saved() { navigate(base, { state: { scaleNotice: t('admin.checklists.scaleLibrary.saved') } }); }
  async function save() {
    if (!editor || editor.readOnly) return;
    const invalid = validateScaleDraft(editor.name, editor.levels);
    if (invalid) { setError(scaleDraftErrorText(invalid, t)); return; }
    await mutate(async () => { const input = scaleDraftToInput(editor.name, editor.levels); if (editor.scaleId) await updateChecklistScale(editor.scaleId, input); else await createChecklistScale(input); saved(); });
  }
  const shell = (children: ReactNode) => observer ? <ObserverPageLayout>{children}</ObserverPageLayout> : <AdminPageLayout brandLabel={t('admin.navLink')} sidebarLabel={t('admin.navLink')} currentUser={currentUser!} navItems={[{ label: t('admin.checklists.title'), href: '/admin/checklists', isCurrent: true }]}>{children}</AdminPageLayout>;
  if (!canRead || (scaleId === 'new' && !canManage)) return shell(<PageState variant="error" message={t('admin.checklists.scaleLibrary.forbidden')} />);
  const selectedTitle = scaleId === 'new' ? t('admin.checklists.scaleManager.newTitle') : scale?.name ?? title;
  const matching = scales.filter((item) => item.name.toLocaleLowerCase(i18n.language).includes(search.trim().toLocaleLowerCase(i18n.language))).sort((a, b) => a.name.localeCompare(b.name, i18n.language) * (descending ? -1 : 1));
  return shell(<>
    {observer ? <ObserverSessionsNav current="scales" /> : <ChecklistsTabs current="scales" />}
    <LibrarySwitch base={base.replace(/\/scales$/, '')} current="scales" />
    <nav aria-label={t('admin.checklists.scaleLibrary.breadcrumbs')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBlock: 16 }}>
      <Link to={observer ? roles.includes('instructor') ? '/instructor/checklists/library' : '/mentor/library' : '/admin/checklists'}>{t('admin.checklists.title')}</Link><span aria-hidden="true">/</span>
      {scaleId ? <><Link to={base}>{title}</Link><span aria-hidden="true">/</span><span aria-current="page" style={{ overflowWrap: 'anywhere' }}>{selectedTitle}</span></> : <span aria-current="page">{title}</span>}
    </nav>
    <AdminPageHeader title={scaleId ? selectedTitle : title} action={!scaleId && canManage && !loading && !error ? <Link className="admin-btn admin-btn--primary" to={`${base}/new`}>{t('admin.checklists.scaleManager.addScale')}</Link> : undefined} />
    {(location.state as { scaleNotice?: string } | null)?.scaleNotice && <p role="status">{(location.state as { scaleNotice: string }).scaleNotice}</p>}
    {loading ? <PageState variant="loading" message={t('admin.checklists.scaleLibrary.loading')} /> : <>
      {error && <div role="alert"><p>{error}</p>{!editor && <Button type="button" onClick={() => setRetry((value) => value + 1)}>{t('longread.retry')}</Button>}</div>}
      {!scaleId && !error && <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBlock: 16 }}>
          <SearchInput aria-label={t('admin.checklists.scaleLibrary.search')} placeholder={t('admin.checklists.scaleLibrary.search')} value={search} onChange={setSearch} />
          <label>{t('admin.checklists.scaleLibrary.sort')} <select value={descending ? 'desc' : 'asc'} onChange={(event) => setDescending(event.target.value === 'desc')}><option value="asc">{t('admin.checklists.scaleLibrary.ascending')}</option><option value="desc">{t('admin.checklists.scaleLibrary.descending')}</option></select></label>
        </div>
        {!matching.length && <PageState variant="info" message={t('admin.checklists.scaleManager.empty')} />}
        <ul className="admin-checklist-instances">{matching.map((item) => <li key={item.id} style={{ padding: 0 }}>
          <Link to={`${base}/${encodeURIComponent(item.id)}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', width: '100%', padding: 16, color: 'inherit', minHeight: 44, overflowWrap: 'anywhere' }}>
            <strong style={{ flex: '1 1 220px', minWidth: 0 }}>{item.isDefault && <span aria-label={t('admin.checklists.scaleManager.defaultBadge')}>🔒 </span>}{item.name}</strong>
            <span>{t('admin.checklists.scaleManager.levelsCount', { count: item.levels.length })}</span>
            <span>{t('admin.checklists.scaleLibrary.usage', { count: item.usageCount ?? 0 })}</span>
            <span>{item.creator ? `${item.creator.firstName} ${item.creator.lastName}` : t(item.isDefault ? 'admin.checklists.scaleLibrary.system' : 'admin.checklists.scaleLibrary.unknownCreator')}</span>
            {item.createdAt && <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short', timeZone: currentUser?.timezone || 'UTC' })}</time>}
            {item.status === 'archived' && <span>{t('admin.checklists.scaleManager.archived')}</span>}
          </Link>
        </li>)}</ul>
      </>}
      {editor && <section className="admin-card" style={{ maxWidth: '100%', minWidth: 0 }}>
        <fieldset disabled={busy} style={{ border: 0, minWidth: 0, margin: 0, padding: 0 }}><ScaleEditor editor={editor} onChange={setEditor} t={t} /></fieldset>
        <section aria-label={t('admin.checklists.scaleLibrary.preview')} style={{ marginBlock: 24 }}><h2>{t('admin.checklists.scaleLibrary.preview')}</h2><ol style={{ paddingInlineStart: 24 }}>{editor.levels.map((level) => <li key={level.key} style={{ overflowWrap: 'anywhere', marginBlock: 8 }}><span aria-hidden="true" style={{ display: 'inline-block', width: 14, height: 14, background: level.color, border: '1px solid var(--color-border)', marginInlineEnd: 8 }} />{level.label} · {level.score}</li>)}</ol></section>
        {scale && <section aria-label={t('admin.checklists.scaleLibrary.usedBy')}><h2>{t('admin.checklists.scaleLibrary.usedBy')}</h2><p>{t('admin.checklists.scaleLibrary.usage', { count: scale.usageCount ?? 0 })}</p><ul>{scale.usedByChecklists?.map((item) => <li key={item.id}><Link to={`${observer ? roles.includes('instructor') ? '/instructor/checklists/library' : '/mentor/library' : '/admin/checklists'}?checklistId=${encodeURIComponent(item.id)}`}>{item.title}</Link></li>)}</ul></section>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
          <Link className="admin-btn admin-btn--secondary" to={base}>{t('admin.checklists.cancel')}</Link>
          {canManage && <>
            {!editor.readOnly && <Button disabled={busy} type="button" onClick={() => void save()}>{t('admin.checklists.save')}</Button>}
            {scale && <Button disabled={busy} variant="secondary" type="button" onClick={() => void mutate(async () => { const copy = await copyChecklistScale(scale.id, t('admin.checklists.scaleManager.copyName', { name: scale.name })); navigate(`${base}/${copy.id}`); })}>{t('admin.checklists.scaleManager.makeCopy')}</Button>}
            {scale && !scale.isDefault && scale.status !== 'archived' && <Button disabled={busy} variant="secondary" type="button" onClick={() => setConfirm('archive')}>{t('admin.checklists.scaleManager.archive')}</Button>}
            {scale && !scale.isDefault && <Button disabled={busy} variant="secondary" type="button" onClick={() => setConfirm('delete')}>{t('admin.checklists.scaleManager.delete')}</Button>}
          </>}
        </div>
      </section>}
    </>}
    <ConfirmDialog open={confirm !== null} title={t(confirm === 'archive' ? 'admin.checklists.scaleManager.archive' : 'admin.checklists.scaleManager.deleteTitle')} message={t(confirm === 'archive' ? 'admin.checklists.scaleLibrary.archiveConfirm' : 'admin.checklists.scaleManager.deleteConfirm', { name: scale?.name ?? '' })} confirmLabel={t(confirm === 'archive' ? 'admin.checklists.scaleManager.archive' : 'admin.checklists.scaleManager.delete')} cancelLabel={t('admin.checklists.cancel')} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm; setConfirm(null); if (scale) void mutate(async () => { if (action === 'archive') await archiveChecklistScale(scale.id); else await deleteChecklistScale(scale.id); saved(); }); }} />
  </>);
}
