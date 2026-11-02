import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { FeedbackAnswerOption } from '@lms/shared/checklist-feedback';
import { AdminPageHeader, AdminPageLayout, ChecklistsTabs, ConfirmDialog } from '../shared/adminPage.js';
import { ObserverPageLayout } from '../shared/observerLayout.js';
import { useSession } from '../shared/session.js';
import { Button, Input, PageState, SearchInput, Textarea } from '../shared/ui.js';
import { listChecklistAnswerSets, getChecklistAnswerSet, saveChecklistAnswerSet, copyChecklistAnswerSet, archiveChecklistAnswerSet, deleteChecklistAnswerSet } from '../shared/api/checklists.js';
import type { ChecklistAnswerSet } from '../shared/api/types.js';
import { ApiClientError } from '../shared/apiClient.js';
import { ObserverSessionsNav } from './ObserverSessionsNav.js';
import { OrderedList } from '../features/checklist-feedback/OrderedList.js';
import { LibrarySwitch } from '../features/checklist-feedback/LibrarySwitch.js';
const option = (): FeedbackAnswerOption => ({ id: crypto.randomUUID(), name: '', description: '' });
export function ChecklistAnswerSetsPage({ observer = false }: { observer?: boolean }) {
  const { t } = useTranslation(), { currentUser } = useSession(), { setId } = useParams<{ setId: string }>(), navigate = useNavigate();
  const roles = currentUser?.roles ?? [], allowed = roles.some((role) => ['admin', 'manager', 'instructor', 'mentor'].includes(role));
  const parent = observer ? roles.includes('instructor') ? '/instructor/checklists' : '/mentor' : '/admin/checklists', base = `${parent}/answer-sets`;
  const [items, setItems] = useState<ChecklistAnswerSet[]>([]), [item, setItem] = useState<ChecklistAnswerSet | null>(null), [name, setName] = useState(''), [options, setOptions] = useState<FeedbackAnswerOption[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [search, setSearch] = useState(''), [retry, setRetry] = useState(0), [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  const readOnly = item?.status === 'archived';
  useEffect(() => {
    let active = true; setError(''); setLoading(true); setItem(null);
    if (!allowed) { setLoading(false); return; }
    if (setId === 'new') { setName(''); setOptions([option(), option()]); setLoading(false); return; }
    void (setId ? getChecklistAnswerSet(setId) : listChecklistAnswerSets()).then((data) => {
      if (!active) return;
      if (Array.isArray(data)) setItems(data); else { setItem(data); setName(data.name); setOptions(data.options); }
    }).catch((cause) => { if (active) setError(cause instanceof ApiClientError && cause.status === 404 ? t('feedbackBuilder.setNotFound') : t('feedbackBuilder.loadError')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Draft edits must not be reset by a translation refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId, retry, allowed]);
  async function mutate(job: () => Promise<void>) {
    if (!allowed || busy) return; setBusy(true); setError('');
    try { await job(); } catch (cause) { setError(cause instanceof ApiClientError && cause.status === 409 ? t('feedbackBuilder.inUseSet') : t('feedbackBuilder.saveError')); } finally { setBusy(false); }
  }
  function saved() { setNotice(t('feedbackBuilder.savedSet')); navigate(base); }
  const content = <>
    {observer ? <ObserverSessionsNav current="scales" /> : <ChecklistsTabs current="scales" />}<LibrarySwitch base={parent} current="answer-sets" />
    <nav aria-label={t('admin.checklists.scaleLibrary.breadcrumbs')} style={{ marginBlock: 16, overflowWrap: 'anywhere' }}><Link to={`${parent}/scales`}>{t('admin.checklists.scaleManager.title')}</Link> / <Link to={base}>{t('feedbackBuilder.answerSets')}</Link>{setId && <> / {setId === 'new' ? t('feedbackBuilder.newSet') : item?.name}</>}</nav>
    <AdminPageHeader title={setId ? setId === 'new' ? t('feedbackBuilder.newSet') : item?.name || t('feedbackBuilder.answerSets') : t('feedbackBuilder.answerSets')} action={!setId && allowed && !loading && !error ? <Link className="admin-btn admin-btn--primary" to={`${base}/new`}>{t('feedbackBuilder.newSet')}</Link> : undefined} />
    {!allowed ? <PageState variant="error" message={t('admin.checklists.scaleLibrary.forbidden')} /> : loading ? <PageState variant="loading" message={t('feedbackBuilder.loadingSets')} /> : <>
      {notice && <p role="status">{notice}</p>}
      {error && <div role="alert"><p>{error}</p>{!item && setId !== 'new' && <Button type="button" onClick={() => setRetry((value) => value + 1)}>{t('longread.retry')}</Button>}</div>}
      {!setId && !error && <><SearchInput aria-label={t('feedbackBuilder.searchSets')} value={search} onChange={setSearch} />
        <ul className="admin-checklist-instances">{items.filter((value) => value.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => a.name.localeCompare(b.name)).map((value) => <li key={value.id}><Link to={`${base}/${value.id}`} style={{ display: 'block', width: '100%', padding: 12, overflowWrap: 'anywhere' }}>{value.name} · {t('feedbackBuilder.optionCount', { count: value.options.length })} · {t('admin.checklists.scaleLibrary.usage', { count: value.usageCount })}{value.status === 'archived' ? ` · ${t('admin.checklists.scaleManager.archived')}` : ''}</Link></li>)}</ul>
        {!items.length && <PageState variant="info" message={t('feedbackBuilder.noSets')} />}
      </>}
      {setId && (setId === 'new' || item) && <section className="admin-card" style={{ minWidth: 0 }}>
        {readOnly && <p role="note">{t('feedbackBuilder.archivedSet')}</p>}{item?.inUse && <p role="note">{t('feedbackBuilder.usedSetWarning')}</p>}
        <Input disabled={busy || readOnly} label={t('feedbackBuilder.setName')} maxLength={255} value={name} onChange={(event) => setName(event.target.value)} /><p>{name.length}/255</p>
        <fieldset disabled={busy || readOnly} style={{ minWidth: 0, padding: 0, border: 0 }}><legend>{t('feedbackBuilder.answers')}</legend>
          <OrderedList items={options} onChange={setOptions}>{(value, index) => <>
            <Input label={t('feedbackBuilder.optionName', { number: index + 1 })} maxLength={255} value={value.name} onChange={(event) => setOptions((list) => list.map((entry) => entry.id === value.id ? { ...entry, name: event.target.value } : entry))} />
            <Textarea label={t('feedbackBuilder.optionDescription', { number: index + 1 })} maxLength={2000} value={value.description ?? ''} onChange={(event) => setOptions((list) => list.map((entry) => entry.id === value.id ? { ...entry, description: event.target.value } : entry))} />
            <Button type="button" variant="secondary" disabled={options.length <= 1} onClick={() => setOptions((list) => list.filter((entry) => entry.id !== value.id))}>{t('admin.checklists.scaleManager.delete')}</Button>
          </>}</OrderedList>
          <Button type="button" variant="secondary" disabled={options.length >= 50} onClick={() => setOptions((list) => [...list, option()])}>{t('feedbackBuilder.addAnswer')}</Button>
        </fieldset>
        {item && <p>{t('admin.checklists.scaleLibrary.usage', { count: item.usageCount })}</p>}<ul>{item?.usedByChecklists.map((sheet) => <li key={sheet.id}><Link to={`${observer ? roles.includes('instructor') ? '/instructor/checklists/library' : '/mentor/library' : '/admin/checklists'}?checklistId=${sheet.id}`}>{sheet.title}</Link></li>)}</ul>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}><Link className="admin-btn admin-btn--secondary" to={base}>{t('admin.checklists.cancel')}</Link>
          {!readOnly && <Button type="button" disabled={busy} onClick={() => { if (!name.trim() || !options.length || options.some((entry) => !entry.name.trim())) { setError(t('feedbackBuilder.invalidSet')); return; } void mutate(async () => { await saveChecklistAnswerSet(item?.id ?? null, { name, options }); saved(); }); }}>{t('admin.checklists.save')}</Button>}
          {item && <><Button type="button" variant="secondary" disabled={busy} onClick={() => void mutate(async () => { const copy = await copyChecklistAnswerSet(item.id, t('admin.checklists.scaleManager.copyName', { name: item.name })); navigate(`${base}/${copy.id}`); })}>{t('admin.checklists.scaleManager.makeCopy')}</Button>
            {!readOnly && <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirm('archive')}>{t('admin.checklists.scaleManager.archive')}</Button>}
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirm('delete')}>{t('admin.checklists.scaleManager.delete')}</Button></>}
        </div>
      </section>}
    </>}
    <ConfirmDialog open={confirm !== null} title={t(confirm === 'archive' ? 'admin.checklists.scaleManager.archive' : 'admin.checklists.scaleManager.delete')} message={t(confirm === 'archive' ? 'feedbackBuilder.archiveSet' : 'feedbackBuilder.deleteSet', { name: item?.name })} confirmLabel={t(confirm === 'archive' ? 'admin.checklists.scaleManager.archive' : 'admin.checklists.scaleManager.delete')} cancelLabel={t('admin.checklists.cancel')} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm; setConfirm(null); if (item) void mutate(async () => { if (action === 'archive') await archiveChecklistAnswerSet(item.id); else await deleteChecklistAnswerSet(item.id); saved(); }); }} />
  </>;
  return observer ? <ObserverPageLayout>{content}</ObserverPageLayout> : <AdminPageLayout currentUser={currentUser!} brandLabel={t('admin.navLink')} sidebarLabel={t('admin.navLink')} navItems={[{ label: t('admin.checklists.title'), href: '/admin/checklists', isCurrent: true }]}>{content}</AdminPageLayout>;
}
