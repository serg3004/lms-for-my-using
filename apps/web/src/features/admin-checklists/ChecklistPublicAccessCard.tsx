import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { getChecklistPublicAccess, reissueChecklistPublicAccess, updateChecklistPublicAccess } from '../../shared/api/checklists.js';
import type { ChecklistPublicAccessMode, ChecklistPublicAccessState, ChecklistPublicAccessUpdate } from '../../shared/api/types.js';
import { ApiClientError } from '../../shared/apiClient.js';
import { apiErrorText } from '../../shared/apiValidationMessage.js';
import { Button, ConfirmDialog, InlineFeedback } from '../../shared/ui.js';
import { ChecklistCheckboxOption } from './ChecklistHelpTip.js';
import { downloadQrPng, downloadQrSvg, qrSvg } from './publicQr.js';

/** The path of the guest page (PR 467) the link and the QR code lead to. */
export const publicLinkPath = (token: string) => `/c/${token}`;
const publicLink = (token: string) => `${window.location.origin}${publicLinkPath(token)}`;

type Pending = { kind: 'access'; access: ChecklistPublicAccessMode } | { kind: 'reissue' } | null;

const stack: CSSProperties = { display: 'grid', gap: 12, minWidth: 0 };
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 };
const radioRow: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0, fontSize: 13.5 };

/**
 * PR 466: «Access by link and QR code» in the "Taking the checklist" card of a free sheet. One switch of the audience serves
 * both the link and the QR code. Only an administrator changes anything (the server enforces it too); everyone else sees the state.
 * The switch, the link and the reissue act at once (they are operations of their own, not part of the settings form's save),
 * each behind a confirmation that says what happens.
 */
export function ChecklistPublicAccessCard({ checklistId, title, savedAccessMode, status, isAdmin }: {
  checklistId: string;
  title: string;
  /** The saved values of the sheet: the entry follows what is stored, not what is typed in the form. */
  savedAccessMode: 'assigned' | 'free';
  status: 'draft' | 'published' | 'archived';
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<ChecklistPublicAccessState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await getChecklistPublicAccess(checklistId));
      setLoadError(null);
    } catch (caught) {
      setLoadError(apiErrorText(caught, t('admin.checklists.publicAccess.loadError', 'Could not load the access by link.')));
    }
  }, [checklistId, t]);
  // A status or mode change (publishing, moving to draft) can switch the entry off on the server: read it again.
  useEffect(() => { void load(); }, [load, savedAccessMode, status]);

  async function apply(input: ChecklistPublicAccessUpdate) {
    setBusy(true);
    setError(null);
    try {
      setState(await updateChecklistPublicAccess(checklistId, { ...input, expectedChangedAt: state?.changedAt ?? null }));
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 409) {
        setError(t('admin.checklists.publicAccess.conflict', 'Another administrator changed this at the same time. The current state is shown; repeat your change if it is still needed.'));
        await load();
      } else {
        setError(apiErrorText(caught, t('admin.checklists.publicAccess.saveError', 'Could not save the access by link.')));
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmPending() {
    const action = pending;
    setPending(null);
    if (!action) return;
    if (action.kind === 'access') {
      await apply({ access: action.access });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setState(await reissueChecklistPublicAccess(checklistId));
    } catch (caught) {
      setError(apiErrorText(caught, t('admin.checklists.publicAccess.reissueError', 'Could not reissue the link. The old link still works.')));
    } finally {
      setBusy(false);
    }
  }

  const token = state?.token ?? null;
  const link = token && state && state.access !== 'off' ? publicLink(token) : null;
  const qr = useMemo(() => (link ? qrSvg(link, { label: t('admin.checklists.publicAccess.qrLabel', 'QR code of the checklist link') }) : null), [link, t]);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The field is selectable: the person can copy by hand.
      setCopied(false);
      document.getElementById('checklist-public-link')?.focus();
    }
  }

  async function savePng() {
    if (!link) return;
    try { await downloadQrPng(link, title); } catch { setError(t('admin.checklists.publicAccess.pngError', 'Could not create the PNG. Download the SVG instead.')); }
  }

  const modeLabel = (mode: ChecklistPublicAccessMode) => ({
    off: t('admin.checklists.publicAccess.mode.off', 'Off'),
    registered: t('admin.checklists.publicAccess.mode.registered', 'Only registered users'),
    everyone: t('admin.checklists.publicAccess.mode.everyone', 'Everyone, even unregistered'),
  })[mode];
  const modeHint = (mode: ChecklistPublicAccessMode) => ({
    off: t('admin.checklists.publicAccess.modeHint.off', 'The link and every printed QR code stop working.'),
    registered: t('admin.checklists.publicAccess.modeHint.registered', 'The link opens for signed-in employees of your organization; others are asked to sign in.'),
    everyone: t('admin.checklists.publicAccess.modeHint.everyone', 'Anyone who has the link can take the checklist without an account; they leave a name and a code from a picture.'),
  })[mode];

  const heading = <h4 style={{ margin: 0 }}>{t('admin.checklists.publicAccess.title', 'Access by link and QR code')}</h4>;
  if (savedAccessMode !== 'free') {
    return <section aria-label={t('admin.checklists.publicAccess.title', 'Access by link and QR code')} data-testid="public-access-card" style={stack}>{heading}
      <p className="admin-form__hint">{t('admin.checklists.publicAccess.notFree', 'Only a checklist with free access can be opened by a link. Save the free access mode first.')}</p></section>;
  }
  if (status !== 'published') {
    return <section aria-label={t('admin.checklists.publicAccess.title', 'Access by link and QR code')} data-testid="public-access-card" style={stack}>{heading}
      <p className="admin-form__hint">{t('admin.checklists.publicAccess.notPublished', 'The link and the QR code are available once the checklist is published. Moving it to a draft or archive switches them off.')}</p></section>;
  }

  const pendingMessage = (() => {
    if (!pending) return null;
    if (pending.kind === 'reissue') {
      return t('admin.checklists.publicAccess.confirm.reissue', 'A new link will be created. The old link and every QR code already printed or shared stop working at once, and passes that guests have started with the old link will no longer be accepted. This cannot be undone.');
    }
    if (pending.access === 'off') {
      return t('admin.checklists.publicAccess.confirm.off', 'The link and every printed QR code stop working at once, and passes that guests have started will no longer be accepted. You can switch it on again later; the same link will work again.');
    }
    if (pending.access === 'everyone') {
      return t('admin.checklists.publicAccess.confirm.everyone', 'The checklist will be open to anyone on the internet who has the link. Answers are accepted without an account, only a name and a code from a picture are asked. Share the link only where that is acceptable, and check the results regularly.');
    }
    return t('admin.checklists.publicAccess.confirm.registered', 'Employees who open the link or scan the QR code and are signed in can take the checklist. Everyone else is asked to sign in first.');
  })();
  const pendingTitle = pending?.kind === 'reissue'
    ? t('admin.checklists.publicAccess.confirmTitle.reissue', 'Reissue the link?')
    : pending?.access === 'off'
      ? t('admin.checklists.publicAccess.confirmTitle.off', 'Switch off access by link?')
      : t('admin.checklists.publicAccess.confirmTitle.on', 'Switch on access by link?');
  const pendingLabel = pending?.kind === 'reissue'
    ? t('admin.checklists.publicAccess.reissue', 'Reissue the link')
    : pending?.access === 'off'
      ? t('admin.checklists.publicAccess.switchOff', 'Switch off')
      : t('admin.checklists.publicAccess.switchOn', 'Switch on');

  return (
    <section aria-label={t('admin.checklists.publicAccess.title', 'Access by link and QR code')} data-testid="public-access-card" style={stack}>
      {heading}
      {loadError && <InlineFeedback tone="error" action={<Button size="sm" variant="secondary" onClick={() => void load()}>{t('admin.checklists.publicAccess.retry', 'Try again')}</Button>}>{loadError}</InlineFeedback>}
      {!state && !loadError && <p className="admin-form__hint" role="status">{t('admin.checklists.publicAccess.loading', 'Loading…')}</p>}
      {state && !isAdmin && (
        <p className="admin-form__hint" data-testid="public-access-readonly">
          {t('admin.checklists.publicAccess.readOnly', 'Access by link: {{mode}}. Only an administrator can change it.', { mode: modeLabel(state.access) })}
        </p>
      )}
      {state && isAdmin && (
        <>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8, minWidth: 0 }}>
            <legend className="admin-form__hint" style={{ padding: 0 }}>{t('admin.checklists.publicAccess.audience', 'Who can take the checklist by the link or the QR code')}</legend>
            {(['off', 'registered', 'everyone'] as const).map((mode) => (
              <label key={mode} style={radioRow}>
                <input checked={state.access === mode} name="checklist-public-access" onChange={() => { if (state.access !== mode) setPending({ kind: 'access', access: mode }); }} style={{ marginTop: 3 }} type="radio" value={mode} />
                <span><strong>{modeLabel(mode)}</strong><br /><small className="admin-form__hint">{modeHint(mode)}</small></span>
              </label>
            ))}
          </fieldset>
          {state.access === 'everyone' && (
            <InlineFeedback tone="warning" title={t('admin.checklists.publicAccess.warningTitle', 'The checklist is open to anyone with the link')}>
              {t('admin.checklists.publicAccess.warning', 'Answers are accepted without an account. A picture code and a limit of passes per day protect the link; review the results and reissue the link if it gets to the wrong people.')}
            </InlineFeedback>
          )}
          {state.access !== 'off' && (
            <>
              <div className="admin-form__field" style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                <label htmlFor="checklist-public-link">{t('admin.checklists.publicAccess.link', 'Link')}</label>
                <div style={row}>
                  <input id="checklist-public-link" onFocus={(event) => event.currentTarget.select()} readOnly style={{ flex: '1 1 260px', minWidth: 0 }} value={link ?? ''} />
                  <Button onClick={() => void copyLink()} size="sm" type="button" variant="secondary">{copied ? t('admin.checklists.publicAccess.copied', 'Copied') : t('admin.checklists.publicAccess.copy', 'Copy')}</Button>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8, justifyItems: 'start', minWidth: 0 }}>
                <span className="admin-form__hint">{t('admin.checklists.publicAccess.qr', 'QR code')}</span>
                {qr && <div data-testid="public-access-qr" dangerouslySetInnerHTML={{ __html: qr }} style={{ width: 'min(100%, 192px)', lineHeight: 0, border: '1px solid var(--color-border, #d4d4d8)' }} />}
                <div style={row}>
                  <Button onClick={() => void savePng()} size="sm" type="button" variant="secondary">{t('admin.checklists.publicAccess.downloadPng', 'Download PNG')}</Button>
                  <Button onClick={() => link && downloadQrSvg(link, title)} size="sm" type="button" variant="secondary">{t('admin.checklists.publicAccess.downloadSvg', 'Download SVG')}</Button>
                </div>
              </div>
              {state.access === 'everyone' && (
                <>
                  <label htmlFor="checklist-guest-name" style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                    <span>{t('admin.checklists.publicAccess.guestName', 'Guest name')}</span>
                    <select disabled={busy} id="checklist-guest-name" onChange={(event) => void apply({ guestNameRequired: event.target.value === 'required' })} value={state.guestNameRequired ? 'required' : 'optional'}>
                      <option value="required">{t('admin.checklists.publicAccess.guestNameRequired', 'Required')}</option>
                      <option value="optional">{t('admin.checklists.publicAccess.guestNameOptional', 'Optional')}</option>
                    </select>
                  </label>
                  <ChecklistCheckboxOption
                    checked={state.guestPhotosAllowed}
                    disabled={busy}
                    hint={t('admin.checklists.publicAccess.guestPhotosHint', 'Off by default: guests answer without attaching photos.')}
                    label={t('admin.checklists.publicAccess.guestPhotos', 'Allow guests to attach photos')}
                    onChange={(checked) => void apply({ guestPhotosAllowed: checked })}
                  />
                </>
              )}
              <label htmlFor="checklist-public-daily-limit" style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                <span>{t('admin.checklists.publicAccess.dailyLimit', 'Guest passes per day')}</span>
                <input defaultValue={state.dailyLimit} disabled={busy} id="checklist-public-daily-limit" key={state.dailyLimit} max={10000} min={1}
                  onBlur={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 10000 && value !== state.dailyLimit) void apply({ dailyLimit: value }); else event.target.value = String(state.dailyLimit); }}
                  style={{ maxWidth: 160 }} type="number" />
                <small className="admin-form__hint">{t('admin.checklists.publicAccess.dailyLimitHint', 'When it is reached, new guests are told to try tomorrow.')}</small>
              </label>
              <div style={row}>
                <Button disabled={busy} onClick={() => setPending({ kind: 'reissue' })} size="sm" type="button" variant="danger">{t('admin.checklists.publicAccess.reissue', 'Reissue the link')}</Button>
              </div>
            </>
          )}
          {state.changedAt && (
            <small className="admin-form__hint">
              {t('admin.checklists.publicAccess.changed', 'Last changed {{when}}{{who}}', {
                when: new Date(state.changedAt).toLocaleString(),
                who: state.changedBy ? `, ${state.changedBy.name}` : '',
              })}
            </small>
          )}
        </>
      )}
      {error && <InlineFeedback tone="error">{error}</InlineFeedback>}
      <ConfirmDialog
        busy={busy}
        cancelLabel={t('admin.checklists.cancel', 'Cancel')}
        confirmLabel={pendingLabel}
        danger={pending?.kind === 'reissue' || (pending?.kind === 'access' && pending.access !== 'registered')}
        message={pendingMessage}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmPending()}
        open={pending !== null}
        title={pendingTitle}
      />
    </section>
  );
}
