import { useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import { createChecklistFromTemplate, listChecklistTemplates } from '../../shared/api/checklists.js';
import type { ChecklistTemplateSummary } from '../../shared/api/checklists.js';
import type { ChecklistSummary } from '../../shared/api/types.js';
import { Button, Dialog } from '../../shared/ui.js';

/** PR 341: "Create from template" -- built-in starter sheets in the interface language. */
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

  useEffect(() => {
    if (!open) return;
    setError(null);
    listChecklistTemplates(locale)
      .then((result) => setTemplates(result.items))
      .catch(() => {
        setTemplates([]);
        setError(t('admin.checklists.templates.loadError', 'Unable to load templates.'));
      });
  }, [open, locale, t]);

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
      <p className="admin-form__hint">{t('admin.checklists.templates.hint', 'A template creates a draft you can edit freely. To start from one of your own sheets, use "Copy" in the list.')}</p>
      {error && <p className="learner-quiz__submit-error" role="alert">{error}</p>}
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
