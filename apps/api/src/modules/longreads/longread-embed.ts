import { BadRequestException } from '@nestjs/common';
import { resolveEmbedUrl, type EmbedSource } from '@lms/shared/longread-media';

/** Accept a URL or a single, strictly tokenized iframe. Only the provider/id survive. No HTML is stored. */
export function resolveLongreadEmbed(input: string): EmbedSource {
  const raw = input.trim(); let address = raw;
  if (raw.startsWith('<')) {
    const frame = raw.match(/^<iframe\b([\s\S]*?)>\s*<\/iframe\s*>$/i);
    if (!frame || /[<>]/.test(frame[1]!)) throw new BadRequestException('Only a single iframe or provider URL is accepted');
    let attributes = frame[1]!, src: string | undefined;
    const seen = new Set<string>();
    while (attributes.trim()) {
      const attr = attributes.match(/^\s+([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/);
      if (!attr) throw new BadRequestException('Iframe attributes must be quoted');
      const name = attr[1]!.toLowerCase(), value = attr[2] ?? attr[3];
      if (seen.has(name) || !['src', 'width', 'height', 'title', 'frameborder', 'allow', 'allowfullscreen', 'referrerpolicy', 'loading', 'sandbox'].includes(name) || value === undefined && name !== 'allowfullscreen') throw new BadRequestException('Unsafe or duplicated iframe attribute');
      seen.add(name); if (name === 'src') src = value;
      attributes = attributes.slice(attr[0].length);
    }
    address = src?.replace(/&amp;/g, '&') ?? '';
  }
  const source = resolveEmbedUrl(address);
  if (!source) throw new BadRequestException('Only HTTPS YouTube and Vimeo video URLs are supported');
  return source;
}
