import { NotFoundException } from '@nestjs/common';
import type { LongreadSettings } from './longreads.schemas.js';
import type { SnapshotBlock } from './longread-publish-check.js';

export type ReaderChapter = { title: string; anchor: string; cover?: import('./longreads.schemas.js').LongreadSettings['cover']; blocks: SnapshotBlock[] };
export type ReaderSnapshot = { lessonId: string; version: number; schemaVersion: number; settings: LongreadSettings; chapters: ReaderChapter[] };
export type ReadingState = { version: number; chapter: string; headingIndex: number | null; maxReached: number };

export function visibleReaderChapters(chapters: ReaderChapter[]): ReaderChapter[] {
  return chapters.map((chapter) => ({ ...chapter, blocks: chapter.blocks.filter((block) => !block.hidden) }));
}
export function validHeading(chapter: ReaderChapter, index: number | null): boolean {
  if (index === null) return true;
  const block = chapter.blocks[index];
  return block?.type === 'heading' && block.schemaVersion === 1;
}
export function readingState(snapshot: ReaderSnapshot, raw: unknown): ReadingState {
  const initial = { version: snapshot.version, chapter: snapshot.chapters[0]?.anchor ?? '', headingIndex: null, maxReached: 0 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return initial;
  const value = raw as Partial<ReadingState>;
  if (value.version !== snapshot.version || !Number.isInteger(value.maxReached) || value.maxReached! < 0) return initial;
  const maxReached = Math.min(value.maxReached!, snapshot.chapters.length - 1);
  const index = snapshot.chapters.findIndex((chapter) => chapter.anchor === value.chapter);
  if (index < 0 || (snapshot.settings.readingOrder === 'sequential' && index > maxReached)) return { ...initial, maxReached };
  const headingIndex = Number.isInteger(value.headingIndex) && validHeading(snapshot.chapters[index]!, value.headingIndex!) ? value.headingIndex! : null;
  return { version: snapshot.version, chapter: value.chapter!, headingIndex, maxReached };
}
export function readerView(snapshot: ReaderSnapshot, state: ReadingState, requested?: string, preview = false) {
  const chapter = requested ?? state.chapter;
  const index = snapshot.chapters.findIndex((item) => item.anchor === chapter);
  if (index < 0 || (!preview && snapshot.settings.readingOrder === 'sequential' && index > state.maxReached)) throw new NotFoundException('Longread chapter not found');
  const available = preview || snapshot.settings.readingOrder === 'free' ? snapshot.chapters.length : Math.min(state.maxReached + 2, snapshot.chapters.length);
  return {
    ...snapshot, version: preview ? null : snapshot.version, preview,
    chapters: snapshot.chapters.map((item, position) => ({ ...item, ...(!preview && snapshot.settings.readingOrder === 'sequential' && position > state.maxReached ? { blocks: [], cover: null } : {}) })),
    navigation: {
      chapter, headingIndex: chapter === state.chapter ? state.headingIndex : null,
      allowedAnchors: snapshot.chapters.slice(0, available).map((item) => item.anchor),
      previousAnchor: snapshot.chapters[index - 1]?.anchor ?? null,
      nextAnchor: snapshot.chapters[index + 1]?.anchor ?? null,
    },
  };
}
