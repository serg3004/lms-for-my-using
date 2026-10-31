import { apiRequest } from '../apiClient.js';
import type { EmbedSource } from '@lms/shared/longread-media';

export type LongreadBlock = {
  id: string; type: string; schemaVersion: number; known: boolean;
  title?: string | null; hidden?: boolean; content: Record<string, unknown>;
};
export type LongreadImage = { fileId: string | null; alt: string; caption: string; width: number; align: 'start' | 'center' | 'end' };
export type LongreadChapter = { id: string; title: string; hidden: boolean; anchor: string; cover?: LongreadImage | null; blocks: LongreadBlock[] };
export type LongreadDraft = {
  lessonId: string; revision: number; schemaVersion: number;
  settings: { readingOrder: 'free' | 'sequential'; requiredChapters: number; tableOfContents: 'expanded' | 'collapsed' | 'off'; direction: 'ltr' | 'rtl'; allowCopy: boolean; cover?: LongreadImage | null };
  chapters: LongreadChapter[];
};
export type SaveLongread = {
  revision: number; settings: LongreadDraft['settings'];
  chapters: { id?: string; title: string; hidden: boolean; cover?: LongreadImage | null; blocks: { id?: string; type: string; schemaVersion: number; title: string | null; hidden: boolean; content: Record<string, unknown> }[] }[];
};
const path = (id: string) => `/lessons/${encodeURIComponent(id)}/longread`;
export const resolveLongreadEmbed = (id: string, input: string) => apiRequest<EmbedSource>(`${path(id)}/embed/resolve`, { method: 'POST', body: JSON.stringify({ input }) });
export const getLongreadDraft = (id: string) => apiRequest<LongreadDraft>(path(id));
export const saveLongreadDraft = (id: string, input: SaveLongread) => apiRequest<LongreadDraft>(path(id), { method: 'PUT', body: JSON.stringify(input) });


export type ReaderBlock = { type: string; schemaVersion: number; title?: string | null; hidden?: boolean; content: unknown };
export type ReaderChapter = { title: string; anchor: string; cover?: LongreadImage | null; blocks: ReaderBlock[] };
export type LongreadReaderDocument = {
  lessonId: string; version: number | null; schemaVersion: number; preview: boolean; draftRevision?: number;
  settings: LongreadDraft['settings']; chapters: ReaderChapter[];
  navigation: { chapter: string; headingIndex: number | null; allowedAnchors: string[]; previousAnchor: string | null; nextAnchor: string | null };
};
export const getPublishedLongread = (id: string, chapter?: string, signal?: AbortSignal) => apiRequest<LongreadReaderDocument>(`${path(id)}/published${chapter ? `?${new URLSearchParams({ chapter })}` : ''}`, { signal });
export const getLongreadPreview = (id: string, chapterId?: string, signal?: AbortSignal) => apiRequest<LongreadReaderDocument>(`${path(id)}/preview${chapterId ? `?${new URLSearchParams({ chapterId })}` : ''}`, { signal });
export const saveReadingPosition = (id: string, input: { version: number; chapter: string; headingIndex?: number | null; mode: 'navigate' | 'bookmark' }, signal?: AbortSignal) => apiRequest<LongreadReaderDocument>(`${path(id)}/position`, { method: 'PUT', body: JSON.stringify(input), signal });

export type LongreadFile = { id: string; fileName: string; mimeType: string; sizeBytes: number; scanStatus: 'pending' | 'scanning' | 'available' | 'rejected' | null; scanReason?: string | null };
export const createLongreadFiles = (id: string, files: { fileName: string; mimeType: string; sizeBytes: number }[]) => apiRequest<LongreadFile[]>(`${path(id)}/files`, { method: 'POST', body: JSON.stringify({ files }) });
export const getLongreadFile = (id: string, fileId: string, signal?: AbortSignal) => apiRequest<LongreadFile>(`${path(id)}/files/${encodeURIComponent(fileId)}`, { signal });
export const getLongreadFileUrl = (id: string, fileId: string, version: number | null, signal?: AbortSignal) => apiRequest<{ url: string; expiresIn: number; fileName: string; mimeType: string; sizeBytes: number }>(`${path(id)}/files/${encodeURIComponent(fileId)}/${version === null ? 'preview' : `download?version=${version}`}`, { signal });
