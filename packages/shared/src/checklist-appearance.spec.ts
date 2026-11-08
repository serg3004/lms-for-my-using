import { describe, expect, it } from 'vitest';
import { APPEARANCE_PRESETS, appearanceContrast, appearanceLowContrast, blockCss, pruneAppearance, resolveBlockStyle, sanitizeAppearance, sanitizeBlockStyle } from './checklist-appearance.js';

const id = '3f2b8c1e-5d4a-4b6f-9a7c-1e2d3c4b5a69';

describe('checklist appearance', () => {
  it('keeps only #RRGGBB colours, 0-4 px borders and radius/padding from the fixed sets', () => {
    expect(sanitizeBlockStyle({ color: '#abcdef', background: 'url(javascript:1)', borderColor: 'red', borderWidth: 9, radius: 7, padding: 13 })).toEqual({ color: '#ABCDEF' });
    expect(sanitizeBlockStyle({ borderWidth: 4, radius: 20, padding: 8, borderColor: '#000000' })).toEqual({ borderWidth: 4, radius: 20, padding: 8, borderColor: '#000000' });
    expect(sanitizeBlockStyle({ borderWidth: 1.5 })).toEqual({});
    expect(sanitizeBlockStyle('x')).toEqual({});
  });
  it('drops unknown kinds, non-uuid override keys and empty styles; null when nothing is left', () => {
    expect(sanitizeAppearance({ blocks: { header: { color: '#111111' }, footer: { color: '#222222' }, item: {} }, overrides: { [id]: { background: '#EEEEEE' }, 'not-a-uuid': { color: '#000000' } } }))
      .toEqual({ blocks: { header: { color: '#111111' } }, overrides: { [id]: { background: '#EEEEEE' } } });
    expect(sanitizeAppearance({ blocks: { header: { color: 'nope' } } })).toBeNull();
    expect(sanitizeAppearance([])).toBeNull();
  });
  it('reads the feedback section like any other kind and still reads a look saved before it existed (PR 442)', () => {
    expect(sanitizeAppearance({ blocks: { feedback: { background: '#fff7cc', borderWidth: 2 }, item: { color: '#111111' } } }))
      .toEqual({ blocks: { feedback: { background: '#FFF7CC', borderWidth: 2 }, item: { color: '#111111' } } });
    expect(sanitizeAppearance({ blocks: { header: { color: '#111111' }, item: { color: '#222222' } } })).toEqual({ blocks: { header: { color: '#111111' }, item: { color: '#222222' } } });
    for (const preset of Object.values(APPEARANCE_PRESETS)) expect(preset.blocks.feedback).toBeDefined();
    expect(resolveBlockStyle({ blocks: { feedback: { color: '#111111' } } }, 'feedback')).toEqual({ color: '#111111' });
  });
  it('prunes overrides of removed blocks', () => {
    expect(pruneAppearance({ blocks: { item: { color: '#111111' } }, overrides: { [id]: { color: '#222222' } } }, new Set())).toEqual({ blocks: { item: { color: '#111111' } } });
  });
  it('lets an override win property by property and builds css without touching outline', () => {
    const appearance = { blocks: { item: { color: '#111111', background: '#FFFFFF', borderWidth: 1 } }, overrides: { [id]: { background: '#EEEEEE' } } };
    expect(resolveBlockStyle(appearance, 'item', id)).toEqual({ color: '#111111', background: '#EEEEEE', borderWidth: 1 });
    expect(blockCss({ color: '#111111', background: '#EEEEEE', borderWidth: 2, borderColor: '#000000', radius: 12, padding: 16 })).toEqual({ color: '#111111', backgroundColor: '#EEEEEE', borderStyle: 'solid', borderWidth: 2, borderColor: '#000000', borderRadius: 12, padding: 16 });
    expect(Object.keys(blockCss({ borderWidth: 0 }))).not.toContain('outline');
  });
  it('measures contrast and warns under AA', () => {
    expect(appearanceContrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(appearanceLowContrast({ color: '#BBBBBB', background: '#FFFFFF' })).toBe(true);
    expect(appearanceLowContrast({ background: '#172033' })).toBe(true);
    expect(appearanceLowContrast({ color: '#FFFFFF', background: '#172033' })).toBe(false);
    expect(appearanceLowContrast({})).toBe(false);
  });
  it('ships three presets that all pass AA and survive sanitizing unchanged', () => {
    for (const preset of Object.values(APPEARANCE_PRESETS)) {
      for (const style of Object.values(preset.blocks)) { expect(appearanceLowContrast(style)).toBe(false); expect(sanitizeBlockStyle(style)).toEqual(style); }
    }
  });
});
