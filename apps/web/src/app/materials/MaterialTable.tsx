import type { TFunction } from 'i18next';
import { AdminStatusSelect } from '../../shared/AdminStatusSelect.js';
import { DataTable, StatusBadge, type Column } from '../../shared/ui.js';
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
  const statusLabels: Record<'active' | 'archived', string> = {
    active: t('admin.materials.status.active', 'Active'),
    archived: t('admin.materials.status.archived', 'Archived'),
  };
  const kindLabels: Record<'file' | 'link', string> = {
    file: t('admin.materials.file', 'File (upload)'),
    link: t('admin.materials.link', 'Link (URL)'),
  };
  const columns: Column<MaterialRow>[] = [
    { key: 'title', label: t('admin.materials.col.title', 'Title'), render: (m) => <a href={m.fileUrl} target="_blank" rel="noreferrer">{m.title}</a> },
    { key: 'kind', label: t('admin.materials.col.kind', 'Kind'), render: (m) => <StatusBadge>{kindLabels[m.kind]}</StatusBadge> },
    { key: 'status', label: t('admin.materials.col.status', 'Status'), render: (m) => <AdminStatusSelect value={m.status} statuses={['active', 'archived']} labels={statusLabels} onChange={(status) => onStatusChange(m.id, status)} /> },
    { key: 'size', label: t('admin.materials.col.size', 'Size'), render: (m) => formatSize(m.sizeBytes, t('admin.materials.unknownSize', '—')) },
    { key: 'actions', label: '', render: (m) => <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => onEdit(m.id)}>{t('admin.materials.edit', 'Edit')}</button> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={materials}
      keyExtractor={(m) => m.id}
      emptyMessage={t('admin.materials.empty', 'No materials found for the selected course.')}
    />
  );
}
