import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isLongreadImage, isLongreadAudio, isLongreadVideo, isLongreadAttachment, normalizeFileId } from '../upload/public.js';

export async function checkLongreadFiles(db: Pick<Prisma.TransactionClient, 'courseMaterial'>, documentId: string, value: unknown, publishing = false) {
  const images = new Set<string>(), attachments = new Set<string>(), audio = new Set<string>(), video = new Set<string>(); let missing = false;
  function reference(raw: unknown, target: Set<string>) {
    const id = normalizeFileId(raw); if (id) target.add(id); else missing = true;
  }
  function walk(raw: unknown) {
    if (Array.isArray(raw)) { raw.forEach(walk); return; }
    if (!raw || typeof raw !== 'object') return;
    const item = raw as Record<string, unknown>;
    const content = item.content as Record<string, unknown> | undefined;
    if (item.type === 'audio') reference(content?.fileId, audio);
    if (item.type === 'video') {
      if (content?.source === 'file') reference(content.fileId, video);
      if (content?.poster) reference((content.poster as { fileId?: unknown }).fileId, images);
    }
    if (item.type === 'embed' && !content?.source) missing = true;
    if (item.type === 'image') { const content = item.content as { fileId?: string | null }; const id = normalizeFileId(content?.fileId); if (id) images.add(id); else missing = true; }
    if (item.type === 'attachments') { const files = (item.content as { files?: { fileId: string }[] })?.files; if (!Array.isArray(files) || !files.length) missing = true; if (Array.isArray(files)) files.forEach((file) => { const id = normalizeFileId(file?.fileId); if (id) attachments.add(id); else missing = true; }); }
    if (typeof item.type === 'string' && !['columns', 'tabs', 'accordion', 'table'].includes(item.type)) return;
    if (item.cover && typeof item.cover === 'object') { const id = normalizeFileId((item.cover as { fileId?: string }).fileId); if (id) images.add(id); else missing = true; }
    Object.values(item).forEach(walk);
  }
  walk(value);
  const ids = [...new Set([...images, ...attachments, ...audio, ...video])];
  const files = ids.length ? await db.courseMaterial.findMany({ where: { id: { in: ids }, longreadDocumentId: documentId, deletedAt: null }, select: { id: true, mimeType: true, scanStatus: true, objectKey: true, status: true } }) : [];
  const invalid = files.length !== ids.length || files.some((file) => images.has(file.id) && !isLongreadImage(file.mimeType ?? '') || attachments.has(file.id) && !isLongreadAttachment(file.mimeType ?? '') || audio.has(file.id) && !isLongreadAudio(file.mimeType ?? '') || video.has(file.id) && !isLongreadVideo(file.mimeType ?? ''));
  if (!publishing) {
    if (invalid) throw new BadRequestException('File does not belong to this longread or has the wrong type');
    if (ids.length) await db.courseMaterial.updateMany({ where: { id: { in: ids }, longreadDocumentId: documentId }, data: { updatedAt: new Date() } });
    return [];
  }
  return missing || invalid || files.some((file) => file.scanStatus !== 'available' || !file.objectKey || file.status !== 'active')
    ? [{ code: 'file_unavailable' as const, message: 'Every referenced file must be uploaded, valid and scanned, and every embed must have an approved source before publishing' }] : [];
}
