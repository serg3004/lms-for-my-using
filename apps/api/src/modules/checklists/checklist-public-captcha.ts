import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * PR 465: the code-captcha of the public entry. Our own, without external services (the page policy and the missing
 * domain rule them out): the server draws a short code as an SVG picture and hands out a signed challenge; the signature
 * binds the code to its expiry, so nothing is stored for an issued challenge. A solved challenge is single-use inside
 * this process (best effort across replicas: the per-address rate limit is the shared protection).
 */

/** Without the look-alikes 0/O, 1/I/L. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CAPTCHA_LENGTH = 5;
export const CAPTCHA_TTL_MS = 5 * 60_000;
const WIDTH = 168;
const HEIGHT = 56;

export type CaptchaChallenge = { challenge: string; svg: string; expiresAt: string };
export type CaptchaVerdict = 'ok' | 'invalid' | 'expired';

const normalizeCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();

export class PublicCaptcha {
  private readonly key: Buffer;
  private readonly used = new Map<string, number>();

  constructor(secret: string, private readonly now: () => number = () => Date.now()) {
    this.key = createHash('sha256').update(`checklist-public-captcha|${secret}`).digest();
  }

  private sign(expiresAt: number, nonce: string, code: string): string {
    return createHmac('sha256', this.key).update(`${expiresAt}|${nonce}|${normalizeCode(code)}`).digest('base64url');
  }

  issue(): CaptchaChallenge {
    const code = Array.from({ length: CAPTCHA_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const expiresAt = this.now() + CAPTCHA_TTL_MS;
    const nonce = randomBytes(9).toString('base64url');
    return { challenge: `${expiresAt}.${nonce}.${this.sign(expiresAt, nonce, code)}`, svg: drawCaptcha(code), expiresAt: new Date(expiresAt).toISOString() };
  }

  /** Checks the answer and burns the challenge so one solved picture cannot be reused. */
  verify(challenge: string, code: string): CaptchaVerdict {
    const [expiresText, nonce, signature, extra] = challenge.split('.');
    const expiresAt = Number(expiresText);
    if (extra !== undefined || !nonce || !signature || !Number.isSafeInteger(expiresAt) || code.length > 32) return 'invalid';
    const expected = Buffer.from(this.sign(expiresAt, nonce, code));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
    const current = this.now();
    if (expiresAt <= current) return 'expired';
    this.prune(current);
    if (this.used.has(nonce)) return 'invalid';
    this.used.set(nonce, expiresAt);
    return 'ok';
  }

  private prune(current: number) {
    for (const [nonce, expiresAt] of this.used) if (expiresAt <= current) this.used.delete(nonce);
  }
}

function drawCaptcha(code: string): string {
  const step = WIDTH / (code.length + 1);
  const glyphs = [...code].map((char, index) => {
    const x = Math.round(step * (index + 1) - 8);
    const y = 36 + randomInt(-5, 6);
    const rotate = randomInt(-22, 23);
    const hue = randomInt(0, 360);
    return `<text x="${x}" y="${y}" transform="rotate(${rotate} ${x + 8} ${y - 8})" fill="hsl(${hue} 55% 32%)" font-family="Verdana,DejaVu Sans,sans-serif" font-size="${randomInt(26, 32)}" font-weight="700">${char}</text>`;
  });
  const noise = Array.from({ length: 5 }, () => `<line x1="${randomInt(0, WIDTH)}" y1="${randomInt(0, HEIGHT)}" x2="${randomInt(0, WIDTH)}" y2="${randomInt(0, HEIGHT)}" stroke="hsl(${randomInt(0, 360)} 40% 55%)" stroke-width="${randomInt(1, 3)}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img"><rect width="${WIDTH}" height="${HEIGHT}" fill="#f4f1ea"/>${noise.join('')}${glyphs.join('')}</svg>`;
}

/** The key that proves a guest owns a pass: bound to the pass and to the current link token, so a reissued link kills it. */
export function guestPassKey(secret: string, instanceId: string, publicToken: string): string {
  const key = createHash('sha256').update(`checklist-guest-pass|${secret}`).digest();
  return createHmac('sha256', key).update(`${instanceId}|${publicToken}`).digest('base64url');
}

export function isGuestPassKey(secret: string, instanceId: string, publicToken: string, given: string): boolean {
  const expected = Buffer.from(guestPassKey(secret, instanceId, publicToken));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
