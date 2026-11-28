import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { assessmentImageTypes, assessmentMaterialSchema, readAssessmentMaterial } from '@lms/shared/longread-media';

import { apiRequest, MAX_BUFFERED_UPLOAD_SIZE_BYTES } from '../../shared/apiClient.js';
import { ImageEditor } from './ImageEditor.js';

export function AssessmentImage({ id, alt, style }: { id: string; alt: string; style?: CSSProperties }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<{ id: string; url?: string }>();
  useEffect(() => {
    let active = true;
    void apiRequest<{ url: string }>(`/assessment-images/${id}`).then(
      ({ url }) => { if (active) setLoaded({ id, url }); },
      () => { if (active) setLoaded({ id }); },
    );
    return () => { active = false; };
  }, [id]);
  if (loaded?.id !== id) return null;
  return loaded.url ? <img src={loaded.url} alt={alt} onError={() => setLoaded({ id })} style={style ?? { maxWidth: '100%', maxHeight: 360 }} />
    : <p role="status">{t('assessmentMaterials.imageError')}</p>;
}

/** PR 539: the uploaded image of a material (nothing else), sized by its container; used by image and card questions. */
export function AssessmentPicture({ value, alt = '', style }: { value?: string | null; alt?: string; style?: CSSProperties }) {
  const material = readAssessmentMaterial(value);
  if (material?.kind !== 'file') return null;
  return <AssessmentImage id={material.fileId} alt={alt || material.alt || material.caption} style={style ?? { display: 'block', width: '100%', height: 'auto' }} />;
}

export function AssessmentMaterial({ value }: { value?: string | null }) {
  const { t } = useTranslation();
  const material = readAssessmentMaterial(value);
  if (!material) return null;
  return <div style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}>
    {material.kind === 'file' && <AssessmentImage id={material.fileId} alt={material.alt || material.caption || t('assessmentMaterials.material')} />}
    {material.kind === 'link' && material.frame && <iframe src={material.frame} title={material.alt || material.caption || t('assessmentMaterials.material')}
      loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
      style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', border: 0 }} />}
    {material.caption && <p>{material.caption}</p>}
    {material.kind === 'link' && <a href={material.url} target="_blank" rel="noopener noreferrer">{t('assessmentMaterials.open')}</a>}
  </div>;
}

type ImagePage = { ids: string[]; nextCursor: string | null };

export function AssessmentMaterialField({ value, onChange }: {
  value?: string | null;
  onChange: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const material = readAssessmentMaterial(value);
  const [url, setUrl] = useState(material?.kind === 'link' ? material.url : '');
  const [caption, setCaption] = useState(material?.caption ?? '');
  const [alt, setAlt] = useState(material?.alt ?? '');
  const [invalid, setInvalid] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [imageError, setImageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<ImagePage>();
  const [loadingImages, setLoadingImages] = useState(false);
  const [fileId, setFileId] = useState(material?.kind === 'file' ? material.fileId : '');
  const [originalId, setOriginalId] = useState(material?.kind === 'file' ? material.originalId ?? '' : '');
  const [editing, setEditing] = useState(false);

  function chooseImage(id: string, original = '') {
    setFileId(id);
    setOriginalId(original);
    setUrl('');
    setInvalid(false);
    onChangeRef.current(JSON.stringify({ kind: 'file', fileId: id, caption, alt, ...(original ? { originalId: original } : {}) }));
  }

  /** PR 541: the edited picture is a new file; the one it was made from stays and can be brought back. */
  async function saveEdited(blob: Blob) {
    const extension = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
    const body = new FormData();
    body.append('file', new File([blob], `edited.${extension}`, { type: blob.type }));
    const { id: newId } = await apiRequest<{ id: string }>('/assessment-images', { method: 'POST', body });
    chooseImage(newId, originalId || fileId);
    setImages(undefined);
    setEditing(false);
  }

  async function listImages(cursor?: string) {
    setLoadingImages(true);
    setImageError(false);
    try {
      const params = cursor ? '?' + new URLSearchParams({ cursor }) : '';
      const page = await apiRequest<ImagePage>(`/assessment-images${params}`);
      setImages((previous) => cursor && previous ? { ...page, ids: [...previous.ids, ...page.ids] } : page);
    } catch {
      setImageError(true);
    } finally {
      setLoadingImages(false);
    }
  }

  async function upload(file: File) {
    const body = new FormData();
    body.append('file', file);
    if (file.size > MAX_BUFFERED_UPLOAD_SIZE_BYTES || !Object.values(assessmentImageTypes).some((type) => type === file.type)) {
      setImageError(true);
      return;
    }
    setBusy(true);
    setImageError(false);
    try {
      const { id } = await apiRequest<{ id: string }>('/assessment-images', { method: 'POST', body });
      chooseImage(id);
      setImages(undefined);
    } catch {
      setImageError(true);
    } finally {
      setBusy(false);
    }
  }

  return <details style={{ maxWidth: '100%', minWidth: 0 }}>
    <summary>{t('assessmentMaterials.material')}</summary>
    <label htmlFor={`${id}-upload`}>{t('longreadFiles.uploadImage')}</label>
    <input id={`${id}-upload`} type="file" style={{ maxWidth: '100%' }} disabled={busy || loadingImages}
      accept={Object.values(assessmentImageTypes).join(',')} onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void upload(file);
      }} />
    <button type="button" className="admin-btn admin-btn--secondary" disabled={busy || loadingImages}
      onClick={() => images ? setImages(undefined) : void listImages()}>{t(images ? 'longread.close' : 'assessmentMaterials.choose')}</button>
    {images && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {images.ids.map((image, index) => <button key={image} type="button" disabled={busy} onClick={() => chooseImage(image)}
        aria-label={t('longreadExercises.option', { number: index + 1 })} style={{ width: 90, minHeight: 44 }}>
        <AssessmentImage id={image} alt="" />
      </button>)}
      {images.nextCursor && <button type="button" className="admin-btn admin-btn--secondary" disabled={busy || loadingImages}
        onClick={() => void listImages(images.nextCursor!)}>{t('assessmentMaterials.moreImages')}</button>}
    </div>}
    {imageError && <p role="alert">{t('assessmentMaterials.imageError')}</p>}
    <label htmlFor={id}>{t('assessmentMaterials.link')}</label>
    <textarea id={id} maxLength={8192} value={url} disabled={busy} style={{ width: '100%', boxSizing: 'border-box' }}
      onChange={(event) => setUrl(event.target.value)} />
    <label htmlFor={`${id}-caption`}>{t('longreadFiles.caption')}</label>
    <input id={`${id}-caption`} value={caption} disabled={busy} maxLength={500} onChange={(event) => setCaption(event.target.value)} />
    <label htmlFor={`${id}-alt`}>{t('assessmentMaterials.alt')}</label>
    <input id={`${id}-alt`} value={alt} disabled={busy} maxLength={300} onChange={(event) => setAlt(event.target.value)} />
    <button type="button" className="admin-btn admin-btn--secondary" disabled={busy} onClick={() => {
      const input = fileId && !url.trim() ? { kind: 'file', fileId, ...(originalId ? { originalId } : {}) } : { kind: 'link', url };
      const parsed = assessmentMaterialSchema.safeParse(JSON.stringify({ ...input, caption, alt }));
      setInvalid(!parsed.success);
      if (parsed.success) { if (input.kind === 'link') { setFileId(''); setOriginalId(''); } onChange(parsed.data); }
    }}>{t('longreadMedia.applyEmbed')}</button>
    {value && <button type="button" className="admin-btn admin-btn--secondary" disabled={busy} onClick={() => {
      onChange(null); setFileId(''); setOriginalId(''); setUrl(''); setCaption(''); setAlt(''); setInvalid(false);
    }}>{t('longreadMedia.remove')}</button>}
    {invalid && <p role="alert">{t('assessmentMaterials.invalid')}</p>}
    {material?.kind === 'file' && !url.trim() && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" className="admin-btn admin-btn--secondary" style={{ minHeight: 44 }} disabled={busy} onClick={() => setEditing(true)}>{t('assessmentMaterials.editImage')}</button>
      {originalId && <button type="button" className="admin-btn admin-btn--secondary" style={{ minHeight: 44 }} disabled={busy}
        onClick={() => chooseImage(originalId)}>{t('assessmentMaterials.restoreOriginal')}</button>}
    </div>}
    {editing && fileId && <ImageEditor fileId={fileId} onClose={() => setEditing(false)} onSave={saveEdited} />}
    <AssessmentMaterial value={value} />
  </details>;
}
