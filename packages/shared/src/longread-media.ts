import { z } from 'zod';

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

const fileId = z.string().uuid().nullable().default(null);
const presentation = { caption: z.string().max(2000).default(''), width: z.number().int().min(10).max(100).default(100) };
export const audioContentSchema = z.object({ fileId, caption: z.string().max(2000).default('') }).strict();
const videoPresentation = { ...presentation, poster: z.object({ fileId }).strict().nullable().default(null) };
export const videoContentSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('file'), fileId, ...videoPresentation }).strict(),
  z.object({ source: z.literal('url'), url: z.string().refine((raw) => canonicalVideoUrl(raw) !== null, 'Use a public HTTPS MP4/WebM URL').transform((raw) => canonicalVideoUrl(raw)!), ...videoPresentation }).strict(),
]);
export const embedContentSchema = z.object({ source: embedSourceSchema.nullable().default(null), ...presentation }).strict();
export type LongreadAudio = z.infer<typeof audioContentSchema>;
export type LongreadVideo = z.infer<typeof videoContentSchema>;
export type LongreadEmbed = z.infer<typeof embedContentSchema>;
