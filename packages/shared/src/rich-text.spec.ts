import { describe, it, expect } from 'vitest';
import { richTextSchema, plainText } from './rich-text.js';

describe('rich text wire contract', () => {
  it('counts visible text and rejects empty markup for required labels', () => {
    expect(richTextSchema(3, 1).parse('<strong>ABC</strong>')).toContain('<strong>ABC</strong>');
    expect(richTextSchema(2).safeParse('<strong>ABC</strong>').success).toBe(false);
    expect(richTextSchema(20, 1).safeParse('<p> </p>').success).toBe(false);
    expect(richTextSchema(20).parse('')).toBe('');
  });
  it('removes scripts, attributes and foreign styles while preserving allowed marks', () => {
    const value = richTextSchema(20).parse('<script>alert(1)</script><strong onclick="bad()">Safe</strong><span style="position:fixed;color:#B91C1C"> red</span>');
    expect(value).not.toMatch(/script|alert|onclick|position/);
    expect(value).toContain('color:#B91C1C');
    expect(plainText(value)).toBe('Safe red');
  });
  it('bounds markup separately and preserves legacy text and entities', () => {
    expect(richTextSchema(100).parse('A < B & C')).toBe('A < B & C');
    expect(plainText('<strong>A &amp; B</strong>')).toBe('A & B');
    expect(richTextSchema(100).safeParse('<b>'.repeat(9000)).success).toBe(false);
  });
});
