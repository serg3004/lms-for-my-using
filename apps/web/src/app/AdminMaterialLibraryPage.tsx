import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminPageHeader, AdminPageLayout, ConfirmDialog, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { createLibraryMaterial, getMaterialUsage, listMaterialLibrary, type LibraryMaterial } from '../shared/api/materialLibrary.js';
import { apiRequest, uploadMaterialFileWithProgress } from '../shared/apiClient.js';
import { FolderCreateMenu } from '../shared/folders/FolderCreateMenu.js';
import { FolderLibraryTable, type FolderLibraryActions } from '../shared/folders/FolderLibraryTable.js';
import { canAddSubfolder } from '../shared/folders/folderTree.js';
import { useLibraryFolders } from '../shared/folders/useLibraryFolders.js';
import { Button, type Column } from '../shared/ui.js';
import { ACCEPTED_MATERIAL_FILE_TYPES, validateMaterialFile } from './materials/fileValidation.js';

/**
 * PR 582: the library of materials. A material lives here on its own, in folders, and is connected to courses and
 * lessons from the course's materials page. Disconnecting never deletes it; deleting warns where it is connected.
 */
export function AdminMaterialLibraryPage() {
  const { t } = useTranslation();
  const library = useLibraryFolders('material');
  const libraryActions = useRef<FolderLibraryActions>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [materials, setMaterials] = useState<LibraryMaterial[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'link' | 'file'>('link');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });
  const [deletion, setDeletion] = useState<{ material: LibraryMaterial; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const openFolderId = library.status === 'loaded' ? library.id : null;

  async function load() {
    try {
      setMaterials(await listMaterialLibrary());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (creating) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [creating]);

  function openCreate() {
    setTitle(''); setUrl(''); setFile(null); setKind('link'); setForm({ status: 'idle' });
    setCreating(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return setForm({ status: 'error', message: t('admin.materialLibrary.titleRequired', 'Enter a title.') });
    if (kind === 'link' && !url.trim()) return setForm({ status: 'error', message: t('admin.materialLibrary.urlRequired', 'Enter a link.') });
    if (kind === 'file' && !file) return setForm({ status: 'error', message: t('admin.materialLibrary.fileRequired', 'Choose a file.') });
    setForm({ status: 'saving' });
    try {
      const created = await createLibraryMaterial({ title: title.trim(), kind, ...(kind === 'link' ? { fileUrl: url.trim() } : {}), ...(openFolderId ? { folderId: openFolderId } : {}) });
      if (kind === 'file' && file) await uploadMaterialFileWithProgress(created.id, file, () => undefined);
      setCreating(false);
      await Promise.all([load(), library.reload()]);
    } catch {
      setForm({ status: 'error', message: t('admin.materialLibrary.saveError', 'Unable to save the material.') });
    }
  }

  function chooseFile(next: File | undefined) {
    if (!next) return;
    const problem = validateMaterialFile(next);
    if (problem) return setForm({ status: 'error', message: problem === 'empty' ? t('admin.materials.emptyFile', 'The selected file is empty.') : t('admin.materials.unsupportedFile', 'Unsupported file type. Choose PDF, MP4, MP3, DOCX, or XLSX.') });
    setForm({ status: 'idle' });
    setFile(next);
  }

  async function askDelete(material: LibraryMaterial) {
    setBusy(true);
    try {
      const { places } = await getMaterialUsage(material.id);
      const names = places.map((place) => place.courseTitle).join(', ');
      setDeletion({ material, message: places.length > 0 ? t('admin.materialLibrary.deleteUsed', { count: places.length, names }) : t('admin.materialLibrary.deleteUnused') });
    } catch {
      setFailed(true);
    } finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!deletion) return;
    setBusy(true);
    try {
      await apiRequest(`/materials/${encodeURIComponent(deletion.material.id)}`, { method: 'DELETE' });
      setDeletion(null);
      await Promise.all([load(), library.reload()]);
    } catch {
      setFailed(true);
    } finally { setBusy(false); }
  }

  const navItems: AdminNavItem[] = [
    { label: t('admin.materials.title', 'Materials'), href: '/admin/materials' },
    { label: t('admin.materialLibrary.title', 'Material library'), href: '/admin/material-library', isCurrent: true },
  ];
  const shown = (materials ?? []).filter((material) => library.data ? material.folderId === openFolderId : true);
  const columns: Column<LibraryMaterial>[] = [
    { key: 'title', priority: 'primary', label: t('admin.materials.col.title', 'Title'), render: (material) => material.fileUrl ? <a href={material.fileUrl} target="_blank" rel="noreferrer">{material.title}</a> : material.title },
    { key: 'kind', priority: 'secondary', label: t('admin.materials.col.kind', 'Kind'), render: (material) => material.kind === 'file' ? t('admin.materials.file', 'File (upload)') : t('admin.materials.link', 'Link (URL)') },
    { key: 'used', priority: 'secondary', label: t('admin.materialLibrary.col.used', 'Used in'), render: (material) => material.usedIn.length > 0 ? material.usedIn.map((place) => place.courseTitle).join(', ') : t('admin.materialLibrary.notUsed', 'Not connected') },
    { key: 'actions', priority: 'secondary', label: '', render: (material) => <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={() => void askDelete(material)}>{t('common.delete', 'Delete')}</Button> },
  ];

  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>
      <AdminPageHeader
        eyebrow={t('admin.materials.eyebrow', 'Files and resources')}
        title={t('admin.materialLibrary.title', 'Material library')}
        subtitle={t('admin.materialLibrary.subtitle', 'Materials that live on their own and are connected to courses and lessons.')}
        action={library.data
          ? <FolderCreateMenu canCreateFolder={canAddSubfolder(library.data.folders, library.id)} itemLabel={t('admin.materialLibrary.createMenu.material', 'Material')} onCreateFolder={() => libraryActions.current?.createFolder()} onCreateItem={openCreate} t={t} />
          : <Button variant="primary" type="button" onClick={openCreate}>+ {t('admin.materialLibrary.create', 'Add material')}</Button>}
      />
      {failed && <p className="admin-form__error" role="alert">{t('admin.materialLibrary.loadError', 'Unable to load the material library.')}</p>}
      <FolderLibraryTable<LibraryMaterial>
        actionsRef={libraryActions} library={library} items={shown} columns={columns} itemTitle={(material) => material.title}
        showFolders afterChange={() => void load()} label={t('admin.materialLibrary.title', 'Material library')}
        emptyMessage={t('admin.materialLibrary.empty', 'No materials here yet.')} t={t}
      />

      <dialog className="admin-dialog" ref={dialogRef} onClose={() => setCreating(false)}>
        <div className="admin-dialog__header">
          <h2>{t('admin.materialLibrary.create', 'Add material')}</h2>
          <button className="admin-dialog__close" onClick={() => setCreating(false)} type="button" aria-label={t('common.close', 'Close')}>✕</button>
        </div>
        <form className="admin-form" onSubmit={(event) => void submit(event)}>
          <FormField id="library-material-title" label={t('admin.materials.col.title', 'Title')} required>
            <input id="library-material-title" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} />
          </FormField>
          <FormField id="library-material-kind" label={t('admin.materials.col.kind', 'Kind')}>
            <select id="library-material-kind" value={kind} onChange={(event) => setKind(event.target.value as 'link' | 'file')}>
              <option value="link">{t('admin.materials.link', 'Link (URL)')}</option>
              <option value="file">{t('admin.materials.file', 'File (upload)')}</option>
            </select>
          </FormField>
          {kind === 'link' ? (
            <FormField id="library-material-url" label={t('admin.materials.fileUrl', 'URL')} required>
              <input id="library-material-url" maxLength={2048} placeholder="https://..." value={url} onChange={(event) => setUrl(event.target.value)} />
            </FormField>
          ) : (
            <FormField id="library-material-file" label={t('admin.materials.file', 'File')} required>
              <input id="library-material-file" type="file" accept={ACCEPTED_MATERIAL_FILE_TYPES.join(",")} onChange={(event) => chooseFile(event.target.files?.[0])} />
            </FormField>
          )}
          {form.status === 'error' && <p className="admin-form__error" role="alert">{form.message}</p>}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setCreating(false)}>{t('common.cancel', 'Cancel')}</button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={form.status === 'saving'}>{form.status === 'saving' ? t('common.saving', 'Saving...') : t('admin.materialLibrary.create', 'Add material')}</button>
          </div>
        </form>
      </dialog>

      <ConfirmDialog
        open={deletion !== null} variant="danger"
        title={t('admin.materialLibrary.deleteTitle', 'Delete material?')} message={deletion?.message ?? ''}
        confirmLabel={t('common.delete', 'Delete')} cancelLabel={t('common.cancel', 'Cancel')}
        onConfirm={() => void confirmDelete()} onCancel={() => setDeletion(null)}
      />
    </AdminPageLayout>
  );
}
