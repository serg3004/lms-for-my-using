/** The token on a badge is 32 random bytes in base64url. A scanner may hand over the whole link, so the part after `#` is taken. */
const shape = /^[A-Za-z0-9_-]{43}$/;

export function badgeTokenFrom(text: string): string | null {
  const trimmed = text.trim();
  const candidate = trimmed.includes('#') ? trimmed.slice(trimmed.lastIndexOf('#') + 1) : trimmed;
  return shape.test(candidate) ? candidate : null;
}

export function badgeLink(token: string, origin: string = window.location.origin) {
  return `${origin}/badge#${token}`;
}

type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

/** The camera can be read only where the browser offers `BarcodeDetector` (Chrome, Edge, Android); elsewhere a scanner or a phone is used. */
export function createQrDetector(): Detector | null {
  const Constructor = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  if (!Constructor) return null;
  try {
    return new Constructor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}
