import { describe, expect, it } from 'vitest';
import { DESCRIPTION_COLORS, descriptionContrast, descriptionHtml, descriptionRuns, descriptionText, sanitizeDescription } from './checklist-description.js';

describe('checklist description markup', () => {
  it('keeps ordinary text, literal brackets, entities and blank lines lossless', () => {
    for (const plain of ['Старый текст\nВторая строка', '1 < 2 & 3 > 2', '&amp;', 'A\n\nB']) {
      expect(sanitizeDescription(plain)).toBe(plain);
      expect(descriptionText(descriptionHtml(plain))).toBe(plain);
    }
  });
  it('removes active content, attributes and foreign namespaces, including malformed nested HTML', () => {
    const value = sanitizeDescription('<p onclick="alert(1)">Safe<script>bad()</script><svg><foreignObject><p>bad</p></foreignObject></svg><img src=x onerror=alert(1)><iframe>bad</iframe></p>');
    expect(value).toBe('Safe');
    expect(sanitizeDescription('<p><strong>Good</strong><math><mtext><img src=x onerror=alert(1)></mtext></math>')).toBe('<p><strong>Good</strong></p>');
  });
  it('normalizes Word emphasis while rejecting unsupported CSS, sizes and non-hex colours', () => {
    const value = sanitizeDescription('<div><span style="font-weight:700;font-style:italic;text-decoration:underline;position:fixed;color:#1d4ed8;font-size:20px;background:url(javascript:bad)">Word</span></div>');
    expect(descriptionRuns(value)[0]).toMatchObject({ text: 'Word', bold: true, italic: true, underline: true, size: 20, color: '#1D4ED8' });
    expect(value).not.toMatch(/position|background|url|javascript/);
    expect(sanitizeDescription('<span style="color:red;font-size:999px;display:none">Visible</span>')).toBe('Visible');
  });
  it('uses CSS uppercase without rewriting stored text and is idempotent', () => {
    const clean = sanitizeDescription('<p><b>важно</b> <span style="text-transform:uppercase;color:#166534;font-size:26px">Read me</span></p>');
    expect(clean).toContain('Read me'); expect(descriptionText(clean)).toBe('важно READ ME');
    expect(sanitizeDescription(clean)).toBe(clean);
  });
  it('keeps encoded tag text inert and avoids double decoding', () => {
    expect(descriptionText(descriptionHtml('<strong>Text &amp;amp; &lt;img&gt;</strong>'))).toBe('Text &amp; <img>');
    expect(descriptionHtml('<p>&lt;script&gt;literal&lt;/script&gt;</p>')).not.toContain('<script>');
  });
  it('bounds pathological nesting and provides AA presets with a custom-colour warning threshold', () => {
    const incompleteTags = '<a'.repeat(12000);
    expect(sanitizeDescription(incompleteTags)).toBe(incompleteTags);
    expect(descriptionRuns(incompleteTags)).toEqual([{ text: incompleteTags }]);
    expect(() => sanitizeDescription('<b>'.repeat(2000) + 'text' + '</b>'.repeat(2000))).not.toThrow();
    for (const color of DESCRIPTION_COLORS) expect(descriptionContrast(color)).toBeGreaterThanOrEqual(4.5);
    expect(descriptionContrast('#FFFF00')).toBeLessThan(4.5);
  });
});
