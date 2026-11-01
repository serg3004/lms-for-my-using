import { describe, expect, it } from 'vitest';
import { continueContentSchema, longreadCompletionInputSchema, publicLongreadProgress } from './longread-progress.js';
describe('Continue and server progress contracts', () => {
  it('defaults to free and rejects unsupported rules and client clocks/scores', () => {
    expect(continueContentSchema.parse({})).toEqual({ mode: 'free', minViewSeconds: 0 });
    for (const input of [{ mode: 'unknown' }, { minViewSeconds: -1 }, { minViewSeconds: 0.5 }]) expect(continueContentSchema.safeParse(input).success).toBe(false);
    for (const field of ['elapsed', 'completed', 'score', 'enteredAt']) expect(longreadCompletionInputSchema.safeParse({ version: 1, chapter: 'first', [field]: 100 }).success).toBe(false);
  });
  it('reports expose only the checked current-version summary, never internal timers/history', () => {
    expect(publicLongreadProgress({ id: 'row', longreadReadingState: { version: 1, learning: {} } })).toEqual({ id: 'row' });
    expect(publicLongreadProgress({ id: 'row', longreadReadingState: null })).toEqual({ id: 'row' });
  });
});
