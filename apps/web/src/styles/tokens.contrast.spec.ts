import { describe, expect, it } from 'vitest';

import css from './tokens.css?inline';

/** PR 578: the high-contrast theme keeps every text pair at 7:1 or more (WCAG AAA) and has no translucent colour. */
const block = css.match(/:root\[data-theme='contrast'\]\s*\{([^}]*)\}/)?.[1] ?? '';
const tokens = new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]));

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function ratio(foreground: string, background: string) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

const color = (name: string) => {
  const value = tokens.get(name);
  expect(value, `--${name}`).toMatch(/^#[0-9a-f]{6}$/);
  return value!;
};

describe('high-contrast theme tokens (PR 578)', () => {
  it('defines the theme', () => {
    expect(block).not.toBe('');
    expect(tokens.get('color-text')).toBe('#000000');
  });

  const pairs: Array<[string, string]> = [
    ['color-text', 'color-background'],
    ['color-text', 'color-surface'],
    ['color-text', 'color-surface-muted'],
    ['color-text', 'color-selected'],
    ['color-text-muted', 'color-surface'],
    ['color-text-muted', 'color-surface-muted'],
    ['color-text-subtle', 'color-surface'],
    ['color-primary', 'color-surface'],
    ['color-primary-hover', 'color-surface'],
    ['color-on-primary', 'color-primary'],
    ['color-on-primary', 'color-primary-hover'],
    ['color-accent-strong', 'color-accent-soft'],
    ['color-violet', 'color-violet-soft'],
    ['color-danger', 'color-surface'],
    ['color-danger-text', 'color-danger-bg'],
    ['color-on-danger', 'color-danger'],
    ['color-success', 'color-surface'],
    ['color-success', 'color-success-bg'],
    ['color-warning', 'color-surface'],
    ['color-warning-text', 'color-warning-bg'],
    ['color-info', 'color-surface'],
    ['color-info-text', 'color-info-bg'],
    ['admin-sidebar-text', 'admin-sidebar-background'],
    ['admin-sidebar-text-muted', 'admin-sidebar-background'],
    ['color-border', 'color-surface'],
    ['color-border-strong', 'color-surface'],
    ['color-card-border', 'color-surface'],
    ['focus-ring', 'color-surface'],
  ];

  it.each(pairs)('%s on %s is at least 7:1', (foreground, background) => {
    expect(ratio(color(foreground), color(background))).toBeGreaterThanOrEqual(7);
  });

  it('uses no translucent colour mixes or shadows', () => {
    expect(block).not.toMatch(/color-mix|rgba?\(|transparent/);
    expect(tokens.get('shadow-card')).toBe('none');
  });
});
