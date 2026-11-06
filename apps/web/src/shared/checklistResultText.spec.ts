import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { checklistResultText } from './checklistResultText.js';
const t = ((_key: string, fallback: string, values?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values?.[key] ?? ''))) as unknown as TFunction;

describe('employee result text', () => {
  const result = { percentage: 90, totalScore: 71, maxScore: 79 };
  it('defaults the display to the percentage only', () => expect(checklistResultText(result, false, t)).toBe('90%'));
  it('shows points only with explicit opt-in', () => expect(checklistResultText(result, true, t)).toBe('71 / 79 (90%)'));
  it('never prints undefined when the learner API withholds points', () => expect(checklistResultText({ percentage: 90 }, true, t)).toBe('90%'));
  it('keeps zero scores and handles a missing percentage', () => {
    expect(checklistResultText({ percentage: 0, totalScore: 0, maxScore: 10 }, true, t)).toBe('0 / 10 (0%)');
    expect(checklistResultText({ percentage: null }, false, t)).toContain('Not scored');
  });
});
