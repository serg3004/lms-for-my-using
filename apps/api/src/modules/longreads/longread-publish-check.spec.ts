import { checkPublishable, type SnapshotChapter } from './longread-publish-check.js';

const paragraph = (text: string, href?: string) => ({ type: 'paragraph', schemaVersion: 1, content: { runs: [{ text, ...(href ? { href } : {}) }] } });
const chapter = (anchor: string, blocks: SnapshotChapter['blocks'], hidden = false): SnapshotChapter => ({ title: anchor, anchor, hidden, blocks });

describe('checkPublishable (PR 382)', () => {
  it('accepts a document with a visible chapter that has content and valid links', () => {
    expect(checkPublishable([chapter('ch-a', [paragraph('hi', '#ch-b')]), chapter('ch-b', [paragraph('x')], true)], {})).toEqual([]);
  });

  it('refuses an empty document, also when only hidden chapters have content', () => {
    expect(checkPublishable([chapter('ch-a', [])], {})[0]).toMatchObject({ code: 'empty_document' });
    expect(checkPublishable([chapter('ch-a', [paragraph('x')], true)], {})[0]).toMatchObject({ code: 'empty_document' });
    expect(checkPublishable([chapter('ch-a', [{ ...paragraph('hidden'), hidden: true }])], {})[0]).toMatchObject({ code: 'empty_document' });
  });

  it('reports unknown and invalid blocks, broken links and impossible required chapters with their place', () => {
    const reasons = checkPublishable(
      [chapter('ch-a', [paragraph('ok'), { type: 'widget', schemaVersion: 1, content: {} }, { type: 'heading', schemaVersion: 1, content: { level: 9, runs: [] } }, paragraph('l', '#gone')])],
      { requiredChapters: 3 },
    );
    expect(reasons.map((r) => [r.code, r.blockIndex])).toEqual([
      ['required_chapters_exceed_visible', undefined],
      ['unknown_block', 1],
      ['invalid_block', 2],
      ['broken_link', 3],
    ]);
  });
});
