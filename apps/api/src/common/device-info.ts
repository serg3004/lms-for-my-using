/**
 * PR 494: what is kept about a device. The raw User-Agent and the full address are never stored: a short
 * "browser · system" label is enough for a person to recognise their own device, and the address is cut.
 */
const browsers: Array<[RegExp, string]> = [
  [/edg(?:e|a|ios)?\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/yabrowser/i, 'Yandex Browser'],
  [/samsungbrowser/i, 'Samsung Internet'],
  [/firefox|fxios/i, 'Firefox'],
  [/chrome|chromium|crios/i, 'Chrome'],
  [/safari/i, 'Safari'],
];

const systems: Array<[RegExp, string]> = [
  [/windows/i, 'Windows'],
  [/android/i, 'Android'],
  [/iphone|ipad|ipod|ios/i, 'iOS'],
  [/mac os x|macintosh/i, 'macOS'],
  [/cros/i, 'ChromeOS'],
  [/linux|x11/i, 'Linux'],
];

export function describeDevice(userAgent: string | undefined | null): string | null {
  if (!userAgent) return null;
  const agent = userAgent.slice(0, 400);
  const browser = browsers.find(([pattern]) => pattern.test(agent))?.[1];
  const system = systems.find(([pattern]) => pattern.test(agent))?.[1];
  if (!browser && !system) return null;
  return [browser ?? 'Browser', system].filter(Boolean).join(' · ');
}

/** IPv4 keeps the first two groups, IPv6 the first three; anything else is dropped. */
export function maskIp(address: string | undefined | null): string | null {
  if (!address) return null;
  const value = address.replace(/^::ffff:/i, '').trim();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(value);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  if (value.includes(':') && /^[0-9a-f:]+$/i.test(value)) {
    const groups = value.split(':').filter((group) => group !== '').slice(0, 3);
    return groups.length > 0 ? `${groups.join(':')}::x` : null;
  }
  return null;
}

export type ClientContext = { userAgent?: string | undefined; ip?: string | undefined };
