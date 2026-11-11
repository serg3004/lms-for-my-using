import { CAPTCHA_TTL_MS, guestPassKey, isGuestPassKey, PublicCaptcha } from './checklist-public-captcha.js';

const secret = '0123456789abcdef0123456789abcdef';

/** The code is only in the picture; the test reads it back by brute force over the alphabet using a second verifier is not possible, so it is read from the SVG text nodes. */
function codeOf(svg: string): string {
  return [...svg.matchAll(/<text [^>]*>([A-Z0-9])<\/text>/g)].map((match) => match[1]).join('');
}

describe('PublicCaptcha (PR 465)', () => {
  it('accepts the drawn code once, ignoring case and spaces, and refuses a replay', () => {
    const captcha = new PublicCaptcha(secret);
    const { challenge, svg } = captcha.issue();
    const code = codeOf(svg);
    expect(code).toHaveLength(5);
    expect(captcha.verify(challenge, ` ${code.toLowerCase()} `)).toBe('ok');
    expect(captcha.verify(challenge, code)).toBe('invalid');
  });

  it('refuses a wrong code, a malformed challenge and a challenge signed with another secret', () => {
    const captcha = new PublicCaptcha(secret);
    const { challenge, svg } = captcha.issue();
    expect(captcha.verify(challenge, 'AAAAA')).toBe('invalid');
    expect(captcha.verify('garbage', codeOf(svg))).toBe('invalid');
    expect(captcha.verify(`${challenge}.x`, codeOf(svg))).toBe('invalid');
    expect(new PublicCaptcha('another-secret-another-secret-123456').verify(challenge, codeOf(svg))).toBe('invalid');
  });

  it('expires after the lifetime', () => {
    let now = 1_000_000;
    const captcha = new PublicCaptcha(secret, () => now);
    const { challenge, svg } = captcha.issue();
    now += CAPTCHA_TTL_MS + 1;
    expect(captcha.verify(challenge, codeOf(svg))).toBe('expired');
  });

  it('a challenge for one code does not verify another code', () => {
    const captcha = new PublicCaptcha(secret);
    const first = captcha.issue();
    const second = captcha.issue();
    if (codeOf(first.svg) !== codeOf(second.svg)) expect(captcha.verify(first.challenge, codeOf(second.svg))).toBe('invalid');
  });

  it('guest pass keys are bound to the pass and to the current token', () => {
    const key = guestPassKey(secret, 'pass-1', 'token-A');
    expect(isGuestPassKey(secret, 'pass-1', 'token-A', key)).toBe(true);
    expect(isGuestPassKey(secret, 'pass-1', 'token-B', key)).toBe(false);
    expect(isGuestPassKey(secret, 'pass-2', 'token-A', key)).toBe(false);
    expect(isGuestPassKey(secret, 'pass-1', 'token-A', 'short')).toBe(false);
  });
});
