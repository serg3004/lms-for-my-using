import { BadRequestException } from '@nestjs/common';
import { extractEmbedAddress, resolveEmbedUrl, type EmbedSource } from '@lms/shared/longread-media';

/** Accept a URL or a single, strictly tokenized iframe. Only the provider/id survive. No HTML is stored. */
export function resolveLongreadEmbed(input: string): EmbedSource {
  const address = extractEmbedAddress(input);
  const source = address && resolveEmbedUrl(address);
  if (!source) throw new BadRequestException('Only HTTPS YouTube and Vimeo video URLs are supported');
  return source;
}
