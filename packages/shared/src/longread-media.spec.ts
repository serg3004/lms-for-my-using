import { describe, expect, it } from 'vitest';
import { canonicalVideoUrl, resolveEmbedUrl, embedUrl, videoContentSchema, embedContentSchema } from './longread-media.js';

describe('longread media source boundaries', () => {
  it.each([
    ['https://youtu.be/abcdefghijk?t=12', 'youtube', 'abcdefghijk'],
    ['https://www.youtube.com/watch?v=abcdefghijk&origin=https://evil.example', 'youtube', 'abcdefghijk'],
    ['https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1', 'youtube', 'abcdefghijk'],
    ['https://vimeo.com/123456789', 'vimeo', '123456789'],
    ['https://player.vimeo.com/video/123456789?autoplay=1', 'vimeo', '123456789'],
  ])('reduces %s to a provider/video identity', (input, provider, videoId) => {
    expect(resolveEmbedUrl(input)).toEqual({ provider, videoId });
    expect(embedUrl(resolveEmbedUrl(input)!)).not.toContain('?');
  });
  it.each(['javascript:alert(1)', 'data:text/html,hi', 'http://youtube.com/watch?v=abcdefghijk', '//youtube.com/embed/abcdefghijk', 'https://youtube.com.evil.example/embed/abcdefghijk', 'https://youtube.com@evil.example/embed/abcdefghijk', 'https://evil.example/video/12345', 'https://www.youtube.com:444/embed/abcdefghijk', 'https://vimeo.com/123/extra', 'https://youtu.be/abcdefghijk/extra'])('rejects an untrusted embedded source: %s', (input) => expect(resolveEmbedUrl(input)).toBeNull());
  it('only accepts public HTTPS direct video URLs, without credentials or executable schemes', () => {
    expect(canonicalVideoUrl('https://media.example.com/demo.MP4?token=example#position')).toBe('https://media.example.com/demo.MP4?token=example');
    for (const value of ['http://media.example.com/a.mp4', 'https://localhost/a.mp4', 'https://127.0.0.1/a.mp4', 'https://[::1]/a.mp4', 'https://0x7f000001/a.mp4', 'https://service.internal/a.mp4', 'https://user:pass@example.com/a.mp4', 'https://example.com:3000/a.mp4', 'javascript:alert(1)', 'https://example.com/embed/abc', 'https://example.com/a.mp4<script>']) expect(canonicalVideoUrl(value)).toBeNull();
  });
  it('strict block schemas cannot smuggle HTML, a free iframe URL or a file into the wrong source shape', () => {
    expect(embedContentSchema.safeParse({ source: { provider: 'youtube', videoId: 'abcdefghijk', srcdoc: '<script>1</script>' } }).success).toBe(false);
    expect(videoContentSchema.safeParse({ source: 'file', fileId: null, url: 'https://evil.example/a.mp4' }).success).toBe(false);
    expect(videoContentSchema.safeParse({ source: 'url', url: 'https://media.example.com/a.mp4#fragment' })).toMatchObject({ success: true, data: { url: 'https://media.example.com/a.mp4', poster: null, width: 100 } });
  });
});
