import { useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import { createChecklistScale, listChecklistScales, updateChecklistScale } from '../../shared/api/checklists.js';
import type { ChecklistScaleSummary } from '../../shared/api/types.js';
import { Button, Dialog, Input } from '../../shared/ui.js';
import { createDefaultReusableScaleLevels } from './domain.js';

/**
 * "Оценочные шкалы" -- a secondary/contextual dialog reached from the builder (not a top-level
 * nav item), matching the prototype's minimal `#scaleModal`: a list of scales and inline rename.
 * Level *editing* beyond a quick-create default stays out of scope here, same as the prototype's
 * own `editScale()` (a bare rename prompt) -- a full level editor is a documented future gap.
 */
export function ScaleManagerDialog({ open, onClose, onChanged, t }: { open: boolean; onClose: () => void; onChanged: () => void; t: TFunction }) {
  const titleId = useId();
  const [scales, setScales] = useState<ChecklistScaleSummary[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listChecklistScales().then(setScales).catch(() => setScales([]));
  }, [open]);

  async function reload() {
    const result = await listChecklistScales().catch(() => scales);
    setScales(result);
  }

  async function addScale() {
    setError(null);
    try {
      await createChecklistScale({ name: t('admin.checklists.scaleManager.newScaleName', 'New scale'), levels: createDefaultReusableScaleLevels(t) });
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('admin.checklists.scaleManager.error', 'Unable to save the scale.'));
    }
  }

  async function saveRename(scaleId: string) {
    if (!renameValue.trim()) return;
    setError(null);
    try {
      await updateChecklistScale(scaleId, { name: renameValue.trim() });
      setRenamingId(null);
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('admin.checklists.scaleManager.error', 'Unable to save the scale.'));
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} open={open}>
      <h2 id={titleId}>{t('admin.checklists.scaleManager.title', 'Evaluation scales')}</h2>
      {error && <p className="learner-quiz__submit-error" role="alert">{error}</p>}
      <ul className="admin-checklist-instances">
        {scales.map((scale) => (
          <li key={scale.id}>
            {renamingId === scale.id ? (
              <>
                <Input aria-label={t('admin.checklists.scaleManager.name', 'Scale name')} onChange={(e) => setRenameValue(e.target.value)} value={renameValue} />
                <Button onClick={() => void saveRename(scale.id)} type="button" variant="primary">{t('admin.checklists.save', 'Save')}</Button>
              </>
            ) : (
              <>
                <div>
                  <b>{scale.name}</b>
                  <span className="admin-form__hint"> {t('admin.checklists.scaleManager.levelsCount', '{{count}} levels', { count: scale.levels.length })}{scale.status === 'archived' ? ` · ${t('admin.checklists.scaleManager.archived', 'Archived')}` : ''}</span>
                </div>
                <Button
                  onClick={() => { setRenamingId(scale.id); setRenameValue(scale.name); }}
                  type="button"
                  variant="secondary"
                >
                  {t('admin.checklists.scaleManager.rename', 'Rename')}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {scales.length === 0 && <p className="admin-form__hint">{t('admin.checklists.scaleManager.empty', 'No evaluation scales yet.')}</p>}
      <div className="ds-dialog__actions">
        <Button onClick={onClose} type="button" variant="secondary">{t('admin.checklists.close', 'Close')}</Button>
        <Button onClick={() => void addScale()} type="button" variant="primary">+ {t('admin.checklists.scaleManager.addScale', 'New scale')}</Button>
      </div>
    </Dialog>
  );
}
