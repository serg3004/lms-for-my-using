import { describe, expect, it } from 'vitest';
import { assessmentMaterialSchema, readAssessmentMaterial } from './longread-media.js';

const encode = (url: string) => JSON.stringify({ kind: 'link', url, caption: 'Watch the introduction' });

describe('assessment materials', () => {
  it.each([
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['<iframe src="https://player.vimeo.com/video/123456789" allowfullscreen></iframe>', 'https://player.vimeo.com/video/123456789'],
    ['https://drive.google.com/file/d/123abc/view', 'https://drive.google.com/file/d/123abc/preview'],
    ['https://onedrive.live.com/embed?resid=ABC%21100&authkey=XYZ', 'https://onedrive.live.com/embed?resid=ABC%21100&authkey=XYZ'],
    ['https://tenant.sharepoint.com/sites/team/_layouts/15/embed.aspx?UniqueId=073d86d6-60cb-4a58-9a7a-e0a73f38a843',
      'https://tenant.sharepoint.com/sites/team/_layouts/15/embed.aspx?UniqueId=073d86d6-60cb-4a58-9a7a-e0a73f38a843'],
    ['https://example.com/resource', null],
    ['https://drive.google.com.example.com/file/d/123abc/view', null],
  ])('normalizes %s for playback', (input, frame) => {
    const stored = assessmentMaterialSchema.parse(encode(input));
    expect(stored).not.toContain('<iframe');
    expect(readAssessmentMaterial(stored)).toMatchObject({ frame, caption: 'Watch the introduction' });
    expect(assessmentMaterialSchema.parse(stored)).toBe(stored);
  });

  it.each([
    'javascript:alert(1)',
    'http://youtu.be/dQw4w9WgXcQ',
    'https://user:password@example.com',
    '<iframe src="https://example.com"></iframe>',
    '<iframe src="https://youtu.be/dQw4w9WgXcQ" onload="alert(1)"></iframe>',
    '<iframe src="https://youtu.be/dQw4w9WgXcQ"></iframe><p>text</p>',
  ])('rejects %s', (input) => expect(assessmentMaterialSchema.safeParse(encode(input)).success).toBe(false));

  it('accepts image IDs and rejects other file types and paths', () => {
    const uuid = '073d86d6-60cb-4a58-9a7a-e0a73f38a843';
    const image = JSON.stringify({ kind: 'file', fileId: `${uuid}.jpg` });
    expect(readAssessmentMaterial(image)).toMatchObject({ kind: 'file', fileId: `${uuid}.jpg` });
    for (const fileId of [`${uuid}.mp4`, `${uuid}.svg`, `../${uuid}.jpg`]) {
      expect(assessmentMaterialSchema.safeParse(JSON.stringify({ kind: 'file', fileId })).success).toBe(false);
    }
  });
});
