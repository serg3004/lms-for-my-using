import { NotFoundException } from '@nestjs/common';
import { readerView, readingState, visibleReaderChapters, type ReaderSnapshot } from './longread-reader.js';
import { longreadPositionSchema, longreadReaderQuerySchema } from './longreads.schemas.js';
import { validateBlockContent } from './longread-blocks.js';
const snapshot: ReaderSnapshot = { lessonId: 'lesson', version: 4, schemaVersion: 1, settings: { readingOrder: 'sequential', requiredChapters: 2, tableOfContents: 'expanded', direction: 'rtl', allowCopy: false },
  chapters: ['one', 'two', 'three'].map((anchor) => ({ anchor, title: anchor, blocks: [{ type: 'heading', schemaVersion: 1, content: { level: 2, runs: [{ text: anchor }] } }] })),
};
describe('longread reader projection and input boundary', () => {
  it('fails closed on malformed/version-mismatched reading state and bounds the frontier', () => {
    for (const raw of [null, [], { version: 3, maxReached: 2, chapter: 'three' }, { version: 4, maxReached: -1, chapter: 'three' }]) expect(readingState(snapshot, raw)).toMatchObject({ chapter: 'one', maxReached: 0, headingIndex: null });
    expect(readingState(snapshot, { version: 4, maxReached: 200, chapter: 'three', headingIndex: 999 })).toMatchObject({ maxReached: 2, headingIndex: null });
  });
  it('omits locked content, allows one next navigation target, and rejects direct jumps', () => {
    const state = readingState(snapshot, {}), view = readerView(snapshot, state);
    expect(view.navigation.allowedAnchors).toEqual(['one', 'two']); expect(view.chapters[1]!.blocks).toEqual([]);
    expect(() => readerView(snapshot, state, 'two')).toThrow(NotFoundException);
    expect(() => readerView(snapshot, state, 'foreign')).toThrow(NotFoundException);
    expect(readerView(snapshot, state, 'three', true).chapters[2]!.blocks).toHaveLength(1);
  });
  it('filters hidden blocks and validates reader metadata instead of client progress', () => {
    expect(visibleReaderChapters([{ ...snapshot.chapters[0]!, blocks: [{ ...snapshot.chapters[0]!.blocks[0]!, hidden: true }] }])[0]!.blocks).toEqual([]);
    expect(longreadPositionSchema.safeParse({ version: 1, chapter: 'one', maxReached: 50 }).success).toBe(false);
    expect(longreadPositionSchema.safeParse({ version: 1, chapter: 'one', headingIndex: 0.5 }).success).toBe(false);
    expect(longreadReaderQuerySchema.safeParse({ chapter: '<script>' }).success).toBe(false);
    expect(validateBlockContent('heading', { level: 2, runs: [{ text: 'Still rendered' }], excludeFromToc: true })).toMatchObject({ ok: true });
    expect(validateBlockContent('heading', { level: 2, runs: [], excludeFromToc: 'yes' }).ok).toBe(false);
  });
});
