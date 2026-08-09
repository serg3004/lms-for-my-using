import { seededShuffle } from './seeded-shuffle.js';

describe('seededShuffle', () => {
  it('is deterministic — the same seed always produces the same order', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];

    expect(seededShuffle(items, 'seed-1')).toEqual(seededShuffle(items, 'seed-1'));
  });

  it('produces a different order for a different seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    expect(seededShuffle(items, 'seed-1')).not.toEqual(seededShuffle(items, 'seed-2'));
  });

  it('does not mutate the input array', () => {
    const items = ['a', 'b', 'c'];
    const original = [...items];

    seededShuffle(items, 'seed-1');

    expect(items).toEqual(original);
  });

  it('preserves every element — a permutation, not a subset', () => {
    const items = [1, 2, 3, 4, 5];

    expect(seededShuffle(items, 'seed-1').sort()).toEqual(items.sort());
  });
});
