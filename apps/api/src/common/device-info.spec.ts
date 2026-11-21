import { describeDevice, maskIp } from './device-info.js';

describe('describeDevice (PR 494)', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Chrome · Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', 'Edge · Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari · iOS'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'Chrome · Android'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Gecko/20100101 Firefox/128.0', 'Firefox · macOS'],
  ])('shortens %s', (agent, expected) => {
    expect(describeDevice(agent)).toBe(expected);
  });

  it('keeps nothing of an unknown or missing agent', () => {
    expect(describeDevice(undefined)).toBeNull();
    expect(describeDevice('')).toBeNull();
    expect(describeDevice('curl/8.4.0')).toBeNull();
  });

  it('never returns the raw agent', () => {
    const label = describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 SecretBuild/9.9.9');
    expect(label).not.toContain('SecretBuild');
    expect(label).not.toContain('130');
  });
});

describe('maskIp (PR 494)', () => {
  it('cuts IPv4 to two groups and IPv6 to three', () => {
    expect(maskIp('203.0.113.77')).toBe('203.0.x.x');
    expect(maskIp('::ffff:198.51.100.9')).toBe('198.51.x.x');
    expect(maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::x');
  });

  it('drops anything that is not an address', () => {
    expect(maskIp(undefined)).toBeNull();
    expect(maskIp('unknown')).toBeNull();
    expect(maskIp('<script>')).toBeNull();
  });
});
