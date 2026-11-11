import { describe, expect, it } from 'vitest';

import { qrFileName, qrModules, qrSvg } from './publicQr.js';

describe('publicQr (PR 466)', () => {
  it('draws a square code with the three finder patterns and a quiet zone', () => {
    const modules = qrModules('https://example.org/c/' + 'A'.repeat(32));
    const n = modules.length;
    expect(n).toBeGreaterThanOrEqual(21);
    expect(modules.every((row) => row.length === n)).toBe(true);
    // Finder patterns: the 7x7 corner squares start dark at their corners and have a dark 3x3 centre.
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
      expect(modules[r]![c]).toBe(true);
      expect(modules[r + 3]![c + 3]).toBe(true);
      expect(modules[r + 1]![c + 1]).toBe(false);
    }
  });

  it('the same link always gives the same code, another link another code', () => {
    const a = qrSvg('https://example.org/c/AAAA');
    expect(qrSvg('https://example.org/c/AAAA')).toBe(a);
    expect(qrSvg('https://example.org/c/BBBB')).not.toBe(a);
  });

  it('adds the sheet name under the code, escaped, and an accessible label', () => {
    const svg = qrSvg('https://example.org/c/x', { caption: 'Смена <1> & "2"', label: 'QR' });
    expect(svg).toContain('Смена &lt;1&gt; &amp; &quot;2&quot;');
    expect(svg).toContain('aria-label="QR"');
    expect(svg).not.toContain('<1>');
    expect(qrSvg('https://example.org/c/x')).not.toContain('<text');
  });

  it('makes a safe, never empty file name', () => {
    expect(qrFileName('Приёмка товара / смена 2', 'png')).toBe('Приёмка-товара-смена-2-qr.png');
    expect(qrFileName('***', 'svg')).toBe('checklist-qr.svg');
    expect(qrFileName('a'.repeat(200), 'svg').length).toBeLessThanOrEqual(70);
  });
});
