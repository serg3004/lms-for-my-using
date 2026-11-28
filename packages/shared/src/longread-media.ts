import { z } from 'zod';
import { richTextSchema } from './rich-text.js';

/** External media is loaded by the browser only; the API never fetches an author's URL. */
export function canonicalVideoUrl(raw: string): string | null {
  if (raw.length > 2048 || /[\s<>\\]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !/\.(mp4|webm)$/i.test(url.pathname)) return null;
    const host = url.hostname.toLowerCase();
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host) || /\.(?:localhost|local|internal|test|invalid)$/i.test(host)) return null;
    url.hash = ''; return url.href;
  } catch { return null; }
}

export const embedSourceSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('youtube'), videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/) }).strict(),
  z.object({ provider: z.literal('vimeo'), videoId: z.string().regex(/^[1-9][0-9]{0,11}$/) }).strict(),
]);
export type EmbedSource = z.infer<typeof embedSourceSchema>;
export function embedUrl(source: EmbedSource): string {
  return source.provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${source.videoId}` : `https://player.vimeo.com/video/${source.videoId}`;
}
export function embedWatchUrl(source: EmbedSource): string {
  return source.provider === 'youtube' ? `https://www.youtube.com/watch?v=${source.videoId}` : `https://vimeo.com/${source.videoId}`;
}
export function resolveEmbedUrl(raw: string): EmbedSource | null {
  if (raw.length > 2048 || /[\s<>\\]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let source: unknown;
    if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com', 'm.youtube.com'].includes(url.hostname)) {
      const path = url.pathname.match(/^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})\/?$/);
      source = { provider: 'youtube', videoId: path?.[1] ?? (url.pathname === '/watch' ? url.searchParams.get('v') : null) };
    } else if (url.hostname === 'youtu.be') source = { provider: 'youtube', videoId: url.pathname.slice(1) };
    else if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)) source = { provider: 'vimeo', videoId: url.pathname.match(/^\/(?:video\/)?([1-9][0-9]{0,11})\/?$/)?.[1] };
    const parsed = embedSourceSchema.safeParse(source); return parsed.success ? parsed.data : null;
  } catch { return null; }
}

const fileId = z.guid().nullable().default(null);
const presentation = { caption: richTextSchema(2000).default(''), width: z.number().int().min(10).max(100).default(100) };
export const audioContentSchema = z.object({ fileId, caption: richTextSchema(2000).default('') }).strict();
const videoPresentation = { ...presentation, poster: z.object({ fileId }).strict().nullable().default(null) };
export const videoContentSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('file'), fileId, ...videoPresentation }).strict(),
  z.object({ source: z.literal('url'), url: z.string().refine((raw) => canonicalVideoUrl(raw) !== null, 'Use a public HTTPS MP4/WebM URL').transform((raw) => canonicalVideoUrl(raw)!), ...videoPresentation }).strict(),
]);
export const embedContentSchema = z.object({ source: embedSourceSchema.nullable().default(null), ...presentation }).strict();
export type LongreadAudio = z.infer<typeof audioContentSchema>;
export type LongreadVideo = z.infer<typeof videoContentSchema>;
export type LongreadEmbed = z.infer<typeof embedContentSchema>;

export function extractEmbedAddress(input: string): string | null {
  const raw = input.trim(); let address = raw;
  if (raw.startsWith('<')) {
    const frame = raw.match(/^<iframe\b([\s\S]*?)>\s*<\/iframe\s*>$/i);
    if (!frame || /[<>]/.test(frame[1]!)) return null;
    let attributes = frame[1]!, src: string | undefined;
    const seen = new Set<string>();
    while (attributes.trim()) {
      const attr = attributes.match(/^\s+([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/);
      if (!attr) return null;
      const name = attr[1]!.toLowerCase(), value = attr[2] ?? attr[3];
      if (seen.has(name) || !['src', 'width', 'height', 'title', 'frameborder', 'allow', 'allowfullscreen', 'referrerpolicy', 'loading', 'sandbox', 'scrolling', 'allowtransparency'].includes(name) || value === undefined && name !== 'allowfullscreen') return null;
      seen.add(name); if (name === 'src') src = value;
      attributes = attributes.slice(attr[0].length);
    }
    address = src?.replace(/&amp;/g, '&') ?? '';
  }
  return address;
}

const materialFields = { caption: z.string().max(500).default(''), alt: z.string().max(300).default('') };
export const assessmentImageTypes = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' } as const;
export const assessmentImageIdSchema = z.string().refine((id) => {
  const [uuid, extension, extra] = id.split('.');
  return extra === undefined && z.guid().safeParse(uuid).success && Object.hasOwn(assessmentImageTypes, extension ?? '');
});

const assessmentMaterialInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('link'), url: z.string().max(8192), provider: z.string().optional(), id: z.string().nullable().optional(), ...materialFields }).strict(),
  // PR 541: an edited picture is a new file; `originalId` keeps the picture it was made from so the author can go back to it.
  z.object({ kind: z.literal('file'), fileId: assessmentImageIdSchema, originalId: assessmentImageIdSchema.optional(), ...materialFields }).strict(),
]);

function resolveMaterialAddress(input: string) {
  const address = extractEmbedAddress(input);
  if (!address || address.length > 2048 || /[\s<>\\]/.test(address)) return null;
  const video = resolveEmbedUrl(address);
  if (video) return { provider: video.provider, id: video.videoId, url: embedWatchUrl(video), frame: embedUrl(video) };
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const driveId = url.hostname === 'drive.google.com' && url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/(?:view|preview))?\/?$/)?.[1];
  if (driveId) {
    const key = url.searchParams.get('resourcekey');
    const query = key ? '?' + new URLSearchParams({ resourcekey: key }) : '';
    return { provider: 'google-drive', id: driveId, url: `https://drive.google.com/file/d/${driveId}/view${query}`,
      frame: `https://drive.google.com/file/d/${driveId}/preview${query}` };
  }
  if (url.hostname === 'onedrive.live.com' && ['/embed', '/view.aspx'].includes(url.pathname)) {
    const id = url.searchParams.get('resid');
    if (id && /^[\w!-]+$/.test(id)) {
      const query = new URLSearchParams({ resid: id });
      for (const key of ['authkey', 'cid']) {
        const value = url.searchParams.get(key);
        if (value) query.set(key, value);
      }
      return { provider: 'onedrive', id, url: `https://onedrive.live.com/view.aspx?${query}`, frame: `https://onedrive.live.com/embed?${query}` };
    }
  }
  if (/^[a-z0-9-]+\.sharepoint\.com$/.test(url.hostname) && /^\/(?:sites\/[\w.-]+\/)?_layouts\/15\/embed\.aspx$/i.test(url.pathname)) {
    const id = url.searchParams.get('UniqueId');
    if (id && z.guid().safeParse(id).success) return { provider: 'sharepoint', id, url: url.href, frame: url.href };
  }
  if (input.trim().startsWith('<')) return null;
  return { provider: 'external', id: null, url: url.href, frame: null };
}

function parseAssessmentMaterial(stored: string) {
  try {
    return assessmentMaterialInput.safeParse(JSON.parse(stored));
  } catch {
    return assessmentMaterialInput.safeParse(null);
  }
}

export const assessmentMaterialSchema = z.string().max(10000).transform((stored, ctx) => {
  const parsed = parseAssessmentMaterial(stored);
  if (!parsed.success) {
    ctx.addIssue({ code: 'custom', message: 'Invalid assessment material' });
    return z.NEVER;
  }
  if (parsed.data.kind === 'file') return JSON.stringify(parsed.data);
  const source = resolveMaterialAddress(parsed.data.url);
  if (!source) {
    ctx.addIssue({ code: 'custom', message: 'Use an HTTPS link or a supported provider iframe' });
    return z.NEVER;
  }
  const { kind, caption, alt } = parsed.data;
  return JSON.stringify({ kind, provider: source.provider, id: source.id, url: source.url, caption, alt });
});

export function readAssessmentMaterial(stored: string | null | undefined) {
  if (!stored) return null;
  const parsed = parseAssessmentMaterial(stored);
  if (!parsed.success) return null;
  const material = parsed.data;
  if (material.kind === 'file') return material;
  const source = resolveMaterialAddress(material.url);
  return source ? { ...material, ...source } : null;
}
