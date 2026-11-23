import type { TFunction } from 'i18next';
import { Button } from '../ui.js';

export function FolderBulkMove({ busy, onClick, t }: { busy: boolean; onClick: () => void; t: TFunction }) {
  return <Button disabled={busy} onClick={onClick} size="sm" type="button" variant="secondary">{t('admin.checklists.folders.moveOpen', 'Move to folder…')}</Button>;
}

export function FolderBulkDelete({ busy, onClick, t }: { busy: boolean; onClick: () => void; t: TFunction }) {
  return <Button disabled={busy} onClick={onClick} size="sm" type="button" variant="danger">{t('admin.checklists.delete', 'Delete')}</Button>;
}
