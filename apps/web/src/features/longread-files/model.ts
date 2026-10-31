import type { LongreadImage } from '../../shared/api/longreads.js';

export const fileTypes: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
  doc: 'application/msword', ppt: 'application/vnd.ms-powerpoint', xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
};
export type FileCategory = 'image' | 'attachments' | 'audio' | 'video';
const categoryOf = (kind: boolean | FileCategory): FileCategory => typeof kind === 'boolean' ? kind ? 'image' : 'attachments' : kind;
const matchesCategory = (mime: string, kind: FileCategory) => kind === 'attachments' ? mime.startsWith('application/') : mime.startsWith(`${kind}/`);
export const acceptFiles = (kind: boolean | FileCategory) => Object.keys(fileTypes).filter((ext) => matchesCategory(fileTypes[ext]!, categoryOf(kind))).map((ext) => `.${ext}`).join(',');
export function prepareFiles(raw: File[], kind: boolean | FileCategory): File[] {
  const category = categoryOf(kind);
  if (!raw.length || raw.length > (category === 'attachments' ? 20 : 1)) throw new Error('batch');
  return raw.map((file) => {
    const type = fileTypes[file.name.split('.').at(-1)?.toLowerCase() ?? ''];
    if (!type || !matchesCategory(type, category)) throw new Error('type');
    if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('size');
    return new File([file], file.name, { type });
  });
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isImageContent(raw: unknown): raw is LongreadImage {
  if (!raw || typeof raw !== 'object') return false;
  const image = raw as LongreadImage;
  return (image.fileId === null || typeof image.fileId === 'string' && uuid.test(image.fileId)) && typeof image.alt === 'string' && image.alt.length <= 2000 && typeof image.caption === 'string' && image.caption.length <= 2000 && Number.isInteger(image.width) && image.width >= 10 && image.width <= 100 && ['start', 'center', 'end'].includes(image.align);
}
export function isAttachmentsContent(raw: unknown): raw is { files: { fileId: string; label?: string }[] } {
  if (!raw || typeof raw !== 'object') return false;
  const files = (raw as { files?: unknown }).files;
  return Array.isArray(files) && files.every((file) => file && typeof file.fileId === 'string' && uuid.test(file.fileId) && (file.label === undefined || typeof file.label === 'string'));
}
