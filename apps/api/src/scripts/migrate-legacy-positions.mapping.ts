import type { LegacyPositionMappingEntry } from '../modules/positions/legacy-position-migration.types.js';

/**
 * Explicit legacy `User.position` -> Position code mapping for the PR 276 one-time backfill.
 * Never auto-generated or fuzzy-matched: add an entry here only after a human has reviewed
 * the inventory report (`pnpm positions:legacy-inventory`) and decided what each distinct
 * legacy value means. A legacy value with no entry stays "unresolved" rather than being
 * guessed at. `positionCode` must already exist as an active Position in the target
 * organization (create it via the Position admin UI/API first) -- this migration never
 * creates a Position.
 */
export const legacyPositionMapping: LegacyPositionMappingEntry[] = [
  // { legacyValue: 'Senior Developer', action: 'map', positionCode: 'senior-developer' },
  // { legacyValue: 'N/A', action: 'skip', reason: 'placeholder value, not a real position title' },
];
