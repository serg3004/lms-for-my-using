import { createHash } from 'node:crypto';

/**
 * Deterministic shuffle: the same seed always produces the same order, so a learner's randomized
 * question/option order stays stable across page reloads within an attempt, while still differing
 * from one learner (or one seed) to the next — the point is to discourage "answer C" being shared
 * between neighbors sitting the same test, not to reshuffle on every render.
 */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const random = mulberry32(hashSeed(seed));
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function hashSeed(seed: string): number {
  const digest = createHash('sha256').update(seed).digest();
  return digest.readUInt32BE(0);
}

/** Small, fast, deterministic PRNG — good enough for shuffling, not for anything security-sensitive. */
function mulberry32(seed: number): () => number {
  let state = seed;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
