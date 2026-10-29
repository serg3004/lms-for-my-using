import { useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import {
  createChecklistFromOrgTemplate,
  createChecklistFromTemplate,
  deleteChecklistOrgTemplate,
  listChecklistOrgTemplates,
  listChecklistTemplates,
  updateChecklistOrgTemplate,
} from '../../shared/api/checklists.js';
import type { ChecklistOrgTemplateSummary, ChecklistTemplateSummary } from '../../shared/api/checklists.js';
import { useOptionalSession } from '../../shared/session.js';
import type { ChecklistSummary } from '../../shared/api/types.js';
import { Button, Dialog } from '../../shared/ui.js';

/** PR 341: "Create from template" -- built-in starter sheets in the interface language. PR 367: plus the organization's own templates; only an administrator renames or deletes them. */
export function ChecklistTemplateDialog({ open, locale, onClose, onCreated, t }: {
  open: boolean;
  locale: string;
  onClose: () => void;
  onCreated: (checklist: ChecklistSummary) => void;
  t: TFunction;
}) {
  const titleId = useId();
  const [templates, setTemplates] = useState<ChecklistTemplateSummary[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = useOptionalSession()?.currentUser?.roles.includes('admin') ?? false;
  const [orgTemplates, setOrgTemplates] = useState<ChecklistOrgTemplateSummary[]>([]);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    listChecklistTemplates(locale)
      .then((result) => setTemplates(result.items))
      .catch(() => {
        setTemplates([]);
        setError(t('admin.checklists.templates.loadError', 'Unable to load templates.'));
      });
    listChecklistOrgTemplates().then((result) => setOrgTemplates(result.items)).catch(() => setOrgTemplates([]));
  }, [open, locale, t]);

  async function startFromOrg(template: ChecklistOrgTemplateSummary) {
    setError(null);
    setBusyKey(template.id);
    try {
      onCreated(await createChecklistFromOrgTemplate(template.id));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('admin.checklists.templates.createError', 'Unable to create a checklist from the template.'));
    } finally {
      setBusyKey(null);
    }
  }

  async function rename() {
    if (!renaming || !renaming.title.trim()) return;
    setError(null);
    try {
      const updated = await updateChecklistOrgTemplate(renaming.id, { title: renaming.title.trim() });
      setOrgTemplates((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setRenaming(null);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('admin.checklists.templates.manageError', 'Unable to change the template.'));
    }
  }

  async function removeOrg(template: ChecklistOrgTemplateSummary) {
    setError(null);
    try {
      await deleteChecklistOrgTemplate(template.id);
      setOrgTemplates((rows) => rows.filter((row) => row.id !== template.id));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('admin.checklists.templates.manageError', 'Unable to change the template.'));
    }
  }

  async function use(template: ChecklistTemplateSummary) {
    setError(null);
    setBusyKey(template.key);
    try {
      onCreated(await createChecklistFromTemplate(template.key, locale));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('admin.checklists.templates.createError', 'Unable to create a checklist from the template.'));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} open={open}>
      <h2 id={titleId}>{t('admin.checklists.templates.title', 'Create from template')}</h2>
      <p className="admin-form__hint">{t('admin.checklists.templates.hint', 'A template creates a draft you can edit freely. To start from one of your own sheets, use "Copy" in the list. An administrator saves a sheet as a template of the organization from the page of that sheet.')}</p>
      {error && <p className="learner-quiz__submit-error" role="alert">{error}</p>}
      {orgTemplates.length > 0 && (
        <>
          <h3>{t('admin.checklists.templates.orgTitle', 'Templates of the organization')}</h3>
          <ul className="admin-checklist-instances">
            {orgTemplates.map((template) => (
              <li key={template.id}>
                <div>
                  {renaming?.id === template.id ? (
                    <input aria-label={t('admin.checklists.templates.rename', 'Template name')} className="admin-input" maxLength={200} onChange={(event) => setRenaming({ id: template.id, title: event.target.value })} value={renaming.title} />
                  ) : (
                    <b>{template.title}</b>
                  )}
                  <span className="admin-form__hint"> {t('admin.checklists.templates.summary', '{{groups}} groups · {{items}} criteria', { groups: template.groupCount, items: template.itemCount })}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button disabled={busyKey !== null} onClick={() => void startFromOrg(template)} type="button" variant="primary">{t('admin.checklists.templates.use', 'Use')}</Button>
                  {isAdmin && (renaming?.id === template.id ? (
                    <Button onClick={() => void rename()} type="button" variant="secondary">{t('admin.checklists.templates.save', 'Save')}</Button>
                  ) : (
                    <Button onClick={() => setRenaming({ id: template.id, title: template.title })} type="button" variant="secondary">{t('admin.checklists.templates.renameOpen', 'Rename')}</Button>
                  ))}
                  {isAdmin && <Button onClick={() => void removeOrg(template)} type="button" variant="danger">{t('admin.checklists.templates.remove', 'Delete')}</Button>}
                </div>
              </li>
            ))}
          </ul>
          <h3>{t('admin.checklists.templates.builtInTitle', 'Built-in templates')}</h3>
        </>
      )}
      <ul className="admin-checklist-instances">
        {(templates ?? []).map((template) => (
          <li key={template.key}>
            <div>
              <b>{template.title}</b>
              <span className="admin-form__hint"> {t('admin.checklists.templates.summary', '{{groups}} groups · {{items}} criteria', { groups: template.groupCount, items: template.itemCount })}</span>
              <p className="admin-form__hint">{template.description}</p>
            </div>
            <Button disabled={busyKey !== null} onClick={() => void use(template)} type="button" variant="primary">{t('admin.checklists.templates.use', 'Use')}</Button>
          </li>
        ))}
      </ul>
      <div className="ds-dialog__actions">
        <Button onClick={onClose} type="button" variant="secondary">{t('admin.checklists.close', 'Close')}</Button>
      </div>
    </Dialog>
  );
}
