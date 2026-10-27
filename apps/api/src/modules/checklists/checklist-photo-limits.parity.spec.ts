import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_BUFFERED_UPLOAD_SIZE_BYTES } from '../upload/public.js';

// The web app cannot import API source, so the client pre-check in
// apps/web/src/shared/checklistPhoto.ts is pinned to the server limits here (PR 348).
const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const quoted = (source: string) => [...source.matchAll(/'([^']+)'/g)].map((match) => match[1]);

describe('client and server checklist photo limits stay equal', () => {
  it('uses the same size limit', () => {
    const client = read('../../../../web/src/shared/apiClient.ts');
    const match = client.match(/export const MAX_BUFFERED_UPLOAD_SIZE_BYTES = (\d+) \* 1024 \* 1024;/);
    expect(match).not.toBeNull();
    expect(Number(match![1]) * 1024 * 1024).toBe(MAX_BUFFERED_UPLOAD_SIZE_BYTES);
    expect(read('../../../../web/src/shared/checklistPhoto.ts')).toContain('CHECKLIST_PHOTO_MAX_BYTES = MAX_BUFFERED_UPLOAD_SIZE_BYTES');
  });

  it('accepts the same image types', () => {
    const server = read('./checklists.controller.ts').match(/ALLOWED_ITEM_PHOTO_MIME_TYPES = new Set\(\[([^\]]+)\]\)/);
    const client = read('../../../../web/src/shared/checklistPhoto.ts').match(/CHECKLIST_PHOTO_TYPES = \[([^\]]+)\] as const/);
    expect(server && client).toBeTruthy();
    expect(quoted(client![1]!)).toEqual(quoted(server![1]!));
    expect(quoted(server![1]!)).toEqual(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
  });
});
