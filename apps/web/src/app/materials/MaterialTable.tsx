import type { TFunction } from 'i18next';

import { AdminStatusSelect } from '../../shared/AdminStatusSelect.js';
import { EmptyState, StatusBadge } from '../../shared/ui.js';
import type { MaterialStatus } from './model.js';

export type MaterialRow = {
  id: string;
  title: string;
  kind: 'file' | 'link';
  fileUrl: string;
  sizeBytes: number | null;
  status: string;
};

function formatSize(sizeBytes: number | null, fallback: string) {
  if (sizeBytes === null) return fallback;
  if (sizeBytes >= 1_048_576) return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${(sizeBytes / 1024).toFixed(0)} KB`;
  return `${sizeBytes} B`;
}

export function MaterialTable({ materials, onEdit, onStatusChange, t }: {
  materials: MaterialRow[];
  onEdit: (materialId: string) => void;
  onStatusChange: (materialId: string, status: MaterialStatus) => void;
  t: TFunction;
}) {
  if (materials.length === 0) {
    return <EmptyState message={t('admin.materials.empty', 'No materials found for the selected course.')} />;
  }
  return (
    <table>
      <thead><tr>
        <th>{t('admin.materials.col.title', 'Title')}</th><th>{t('admin.materials.col.kind', 'Kind')}</th>
        <th>{t('admin.materials.col.status', 'Status')}</th><th>{t('admin.materials.col.size', 'Size')}</th><th />
      </tr></thead>
      <tbody>{materials.map((material) => (
        <tr key={material.id}>
          <td><a href={material.fileUrl} target="_blank" rel="noreferrer">{material.title}</a></td>
          <td><StatusBadge>{material.kind}</StatusBadge></td>
          <td><AdminStatusSelect value={material.status} statuses={['active', 'archived']} onChange={(status) => onStatusChange(material.id, status)} /></td>
          <td>{formatSize(material.sizeBytes, t('admin.materials.unknownSize', '—'))}</td>
          <td><button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => onEdit(material.id)}>{t('admin.materials.edit', 'Edit')}</button></td>
        </tr>
      ))}</tbody>
    </table>
  );
}
