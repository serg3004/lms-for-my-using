/**
 * Trim + Unicode NFC + case-fold. Plan PR 276 allows this normalization only to identify
 * that two raw strings are literally the same value written differently -- it must never be
 * used to treat merely *similar* strings (e.g. "Senior Dev" vs "Senior Developer") as one.
 */
export function normalizeLegacyPositionValue(value: string): string {
  return value.trim().normalize('NFC').toLowerCase();
}

/**
 * One human-authored decision for a distinct legacy `User.position` value. There is no
 * fuzzy/automatic variant: every legacy value not covered by an entry here stays
 * "unresolved" rather than being guessed at (plan invariant).
 */
export type LegacyPositionMappingEntry =
  | { legacyValue: string; action: 'map'; positionCode: string }
  | { legacyValue: string; action: 'skip'; reason: string };

export type ResolvedMappingEntry =
  | { type: 'map'; positionCode: string }
  | { type: 'skip'; reason: string }
  | { type: 'ambiguous'; conflictingEntries: LegacyPositionMappingEntry[] };

/**
 * Groups mapping entries by normalized value and flags any value with mutually inconsistent
 * entries (e.g. mapped to two different Position codes, or both mapped and skipped) as
 * ambiguous -- a config error the mapping file's author must resolve, never auto-picked.
 */
export function buildMappingIndex(entries: readonly LegacyPositionMappingEntry[]): Map<string, ResolvedMappingEntry> {
  const grouped = new Map<string, LegacyPositionMappingEntry[]>();
  for (const entry of entries) {
    const key = normalizeLegacyPositionValue(entry.legacyValue);
    const list = grouped.get(key) ?? [];
    list.push(entry);
    grouped.set(key, list);
  }

  const index = new Map<string, ResolvedMappingEntry>();
  for (const [key, list] of grouped) {
    const distinctResolutions = new Set(
      list.map((entry) => (entry.action === 'map' ? `map:${entry.positionCode}` : `skip:${entry.reason}`)),
    );
    if (distinctResolutions.size > 1) {
      index.set(key, { type: 'ambiguous', conflictingEntries: list });
      continue;
    }
    const entry = list[0]!;
    index.set(key, entry.action === 'map' ? { type: 'map', positionCode: entry.positionCode } : { type: 'skip', reason: entry.reason });
  }
  return index;
}
