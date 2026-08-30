import { buildMappingIndex, normalizeLegacyPositionValue } from './legacy-position-migration.types.js';

describe('normalizeLegacyPositionValue', () => {
  it('trims, case-folds, and NFC-normalizes', () => {
    expect(normalizeLegacyPositionValue('  Senior Developer  ')).toBe('senior developer');
    expect(normalizeLegacyPositionValue('SENIOR DEVELOPER')).toBe('senior developer');
  });

  it('does not collapse genuinely different strings', () => {
    expect(normalizeLegacyPositionValue('Senior Developer')).not.toBe(normalizeLegacyPositionValue('Senior Dev'));
  });
});

describe('buildMappingIndex', () => {
  it('resolves a map entry', () => {
    const index = buildMappingIndex([{ legacyValue: 'Senior Developer', action: 'map', positionCode: 'senior-dev' }]);
    expect(index.get('senior developer')).toEqual({ type: 'map', positionCode: 'senior-dev' });
  });

  it('resolves a skip entry', () => {
    const index = buildMappingIndex([{ legacyValue: 'N/A', action: 'skip', reason: 'placeholder value' }]);
    expect(index.get('n/a')).toEqual({ type: 'skip', reason: 'placeholder value' });
  });

  it('dedupes identical repeated entries without flagging them ambiguous', () => {
    const index = buildMappingIndex([
      { legacyValue: 'Senior Developer', action: 'map', positionCode: 'senior-dev' },
      { legacyValue: 'senior developer', action: 'map', positionCode: 'senior-dev' },
    ]);
    expect(index.get('senior developer')).toEqual({ type: 'map', positionCode: 'senior-dev' });
  });

  it('flags conflicting map targets for the same normalized value as ambiguous', () => {
    const entries: [import('./legacy-position-migration.types.js').LegacyPositionMappingEntry, import('./legacy-position-migration.types.js').LegacyPositionMappingEntry] = [
      { legacyValue: 'Senior Developer', action: 'map', positionCode: 'senior-dev' },
      { legacyValue: 'SENIOR DEVELOPER', action: 'map', positionCode: 'staff-engineer' },
    ];
    const index = buildMappingIndex(entries);
    expect(index.get('senior developer')).toEqual({ type: 'ambiguous', conflictingEntries: entries });
  });

  it('flags a value both mapped and skipped as ambiguous', () => {
    const index = buildMappingIndex([
      { legacyValue: 'Lead', action: 'map', positionCode: 'lead' },
      { legacyValue: 'Lead', action: 'skip', reason: 'reviewed, not a real title' },
    ]);
    expect(index.get('lead')?.type).toBe('ambiguous');
  });
});
