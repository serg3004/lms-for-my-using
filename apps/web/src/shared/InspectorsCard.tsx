import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createInspector, listInspectors, revokeInspector, type InspectorItem, type InspectorVisible } from './api/employeeCard.js';
import { AdminCard, FormField } from './adminPage.js';
import { ConfirmDialog } from './ui.js';
import { formatDate } from './formatDate.js';

const fields: readonly InspectorVisible[] = ['photo', 'position', 'department', 'employeeNumber'];
const blocks: readonly InspectorVisible[] = ['clearance', 'courses', 'certificates', 'checklists'];
const defaultVisible: InspectorVisible[] = ['photo', 'clearance'];
const days = (count: number) => new Date(Date.now() + count * 86_400_000).toISOString().slice(0, 10);

/** PR 507: outside inspectors: invited by email, they open only the employee card and see only what is ticked, until the date. */
export function InspectorsCard() {
  const { t } = useTranslation();
  const [items, setItems] = useState<InspectorItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [until, setUntil] = useState(() => days(30));
  const [visible, setVisible] = useState<InspectorVisible[]>(defaultVisible);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<'created' | 'createError' | 'revoked' | 'revokeError' | null>(null);
  const [revoking, setRevoking] = useState<InspectorItem | null>(null);

  const load = useCallback(() => {
    listInspectors().then((result) => { setItems(result.items); setLoadError(false); }).catch(() => setLoadError(true));
  }, []);
  useEffect(load, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice(null);
    try {
      // The access ends at the end of the chosen day.
      await createInspector({ email, firstName, lastName, visible, accessUntil: new Date(`${until}T23:59:59`).toISOString() });
      setEmail(''); setFirstName(''); setLastName('');
      setNotice('created');
      load();
    } catch { setNotice('createError'); } finally { setBusy(false); }
  }
  async function revoke() {
    if (!revoking) return;
    setBusy(true); setNotice(null);
    try { await revokeInspector(revoking.userId); setNotice('revoked'); load(); } catch { setNotice('revokeError'); } finally { setBusy(false); setRevoking(null); }
  }
  const toggle = (key: InspectorVisible, on: boolean) => setVisible((current) => (on ? [...current, key] : current.filter((item) => item !== key)));
  const labelOf = (key: InspectorVisible) => (fields.includes(key) ? t(`employeeCard.inspectors.field.${key as 'photo'}`) : t(`employeeCard.blocks.${key as 'courses'}`));

  return (
    <AdminCard>
      <h2>{t('employeeCard.inspectors.title')}</h2>
      <p>{t('employeeCard.inspectors.hint')}</p>
      <form className="admin-form" onSubmit={(event) => void create(event)}>
        <FormField id="inspector-email" label={t('employeeCard.inspectors.email')} required><input id="inspector-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></FormField>
        <FormField id="inspector-first" label={t('employeeCard.inspectors.firstName')} required><input id="inspector-first" required value={firstName} onChange={(event) => setFirstName(event.target.value)} /></FormField>
        <FormField id="inspector-last" label={t('employeeCard.inspectors.lastName')} required><input id="inspector-last" required value={lastName} onChange={(event) => setLastName(event.target.value)} /></FormField>
        <FormField id="inspector-until" label={t('employeeCard.inspectors.until')} required hint={t('employeeCard.inspectors.untilHint')}><input id="inspector-until" type="date" required min={days(1)} max={days(90)} value={until} onChange={(event) => setUntil(event.target.value)} /></FormField>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 4 }}>
          <legend>{t('employeeCard.inspectors.visibleTitle')}</legend>
          {[...fields, ...blocks].map((key) => (
            <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={visible.includes(key)} onChange={(event) => toggle(key, event.target.checked)} />
              <span>{labelOf(key)}</span>
            </label>
          ))}
        </fieldset>
        {notice === 'created' ? <p role="status">{t('employeeCard.inspectors.created')}</p> : null}
        {notice === 'createError' ? <p className="admin-form__error" role="alert">{t('employeeCard.inspectors.createError')}</p> : null}
        <div className="admin-form__actions">
          <button className="admin-btn admin-btn--primary" disabled={busy} type="submit">{busy ? t('employeeCard.inspectors.creating') : t('employeeCard.inspectors.create')}</button>
        </div>
      </form>
      {loadError ? <p className="admin-form__error" role="alert">{t('employeeCard.inspectors.loadError')}</p> : null}
      {items && items.length === 0 ? <p>{t('employeeCard.inspectors.empty')}</p> : null}
      {items && items.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {items.map((item) => (
            <li key={item.userId} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item.name}, {item.email}: {t(`employeeCard.inspectors.state.${item.state}`)}, {t('employeeCard.inspectors.access')} {formatDate(item.accessUntil, undefined, { dateStyle: 'medium' })}</span>
              {item.state === 'active' || item.state === 'invited' ? <button className="admin-btn admin-btn--danger" disabled={busy} type="button" onClick={() => setRevoking(item)}>{t('employeeCard.inspectors.revoke')}</button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {notice === 'revoked' ? <p role="status">{t('employeeCard.inspectors.revoked')}</p> : null}
      {notice === 'revokeError' ? <p className="admin-form__error" role="alert">{t('employeeCard.inspectors.revokeError')}</p> : null}
      <ConfirmDialog open={revoking !== null} title={t('employeeCard.inspectors.revoke')} message={t('employeeCard.inspectors.revokeConfirm')} confirmLabel={t('employeeCard.inspectors.revoke')} cancelLabel={t('employeeCard.inspectors.cancel')} danger busy={busy}
        onConfirm={() => void revoke()} onCancel={() => { if (!busy) setRevoking(null); }} />
    </AdminCard>
  );
}
