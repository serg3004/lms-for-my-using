import { resolveLongreadEmbed } from './longread-embed.js';
import { validateBlockContent } from './longread-blocks.js';

describe('server embed resolution', () => {
  it('discards iframe HTML, arbitrary provider parameters and requested capabilities', () => {
    const value = resolveLongreadEmbed('<iframe width="560" height="315" src="https://www.youtube.com/embed/abcdefghijk?autoplay=1&amp;origin=https://evil.example" title="Example" frameborder="0" allow="camera; microphone; autoplay" referrerpolicy="no-referrer" allowfullscreen></iframe>');
    expect(value).toEqual({ provider: 'youtube', videoId: 'abcdefghijk' });
    expect(resolveLongreadEmbed(" <iframe src='https://player.vimeo.com/video/123456789'></iframe> ")).toEqual({ provider: 'vimeo', videoId: '123456789' });
  });
  it.each([
    '<iframe src="https://evil.example/video"></iframe>', '<iframe srcdoc="<script>1</script>" src="https://www.youtube.com/embed/abcdefghijk"></iframe>',
    '<iframe src="https://www.youtube.com/embed/abcdefghijk" onload="attack()"></iframe>',
    '<iframe src="javascript:alert(1)"></iframe>', '<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe><script>1</script>',
    '<iframe src="https://www.youtube.com/embed/abcdefghijk" src="https://evil.example"></iframe>', '<iframe src=https://www.youtube.com/embed/abcdefghijk></iframe>',
    '<iframe src="https://www.youtube.com/embed/abcdefghijk"><iframe></iframe></iframe>', '<iframe src="https://www.youtube.com/embed/abcdefghijk" style="position:fixed"></iframe>',
  ])('rejects unsafe markup: %s', (input) => expect(() => resolveLongreadEmbed(input)).toThrow());
  it('stores canonical typed media data and rejects unknown fields and unsafe direct video URLs', () => {
    expect(validateBlockContent('audio', { fileId: null, caption: 'Audio' })).toMatchObject({ ok: true, known: true });
    expect(validateBlockContent('video', { source: 'url', url: 'https://media.example.com/video.mp4#foo' })).toMatchObject({ ok: true, content: { url: 'https://media.example.com/video.mp4' } });
    expect(validateBlockContent('embed', { source: resolveLongreadEmbed('https://vimeo.com/123456789') })).toMatchObject({ ok: true, known: true });
    expect(validateBlockContent('embed', { source: { provider: 'other', videoId: 'id' } })).toMatchObject({ ok: false });
    expect(validateBlockContent('video', { source: 'url', url: 'javascript:alert(1)' })).toMatchObject({ ok: false });
  });
});
