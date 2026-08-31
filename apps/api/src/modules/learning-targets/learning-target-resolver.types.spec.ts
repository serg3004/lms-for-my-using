import { buildResolution, type LearningTargetSource } from './learning-target-resolver.types.js';

function source(overrides: Partial<LearningTargetSource> & Pick<LearningTargetSource, 'type' | 'id'>): LearningTargetSource {
  return { requirement: 'REQUIRED', dueAt: null, ...overrides };
}

describe('buildResolution', () => {
  it('returns no entitlement for an empty source list', () => {
    const resolution = buildResolution([]);

    expect(resolution).toEqual({ sources: [], isEntitled: false, effectiveRequirement: null, effectiveDueAt: null, displaySource: null });
  });

  it('is entitled with a single OPTIONAL source (self-enrollment)', () => {
    const resolution = buildResolution([source({ type: 'SELF_ENROLLMENT', id: 'course-1', requirement: 'OPTIONAL' })]);

    expect(resolution.isEntitled).toBe(true);
    expect(resolution.effectiveRequirement).toBe('OPTIONAL');
    expect(resolution.displaySource?.type).toBe('SELF_ENROLLMENT');
  });

  it('REQUIRED beats OPTIONAL regardless of source order', () => {
    const resolution = buildResolution([
      source({ type: 'SELF_ENROLLMENT', id: 'course-1', requirement: 'OPTIONAL' }),
      source({ type: 'POSITION', id: 'pc-1', requirement: 'REQUIRED' }),
    ]);

    expect(resolution.effectiveRequirement).toBe('REQUIRED');
  });

  it('picks the earliest non-null due date within the winning requirement tier only', () => {
    const later = new Date('2026-06-01T00:00:00.000Z');
    const earlier = new Date('2026-01-01T00:00:00.000Z');
    const resolution = buildResolution([
      source({ type: 'DIRECT_ASSIGNMENT', id: 'a1', requirement: 'REQUIRED', dueAt: later }),
      source({ type: 'DEPARTMENT', id: 'a2', requirement: 'REQUIRED', dueAt: earlier }),
      // An OPTIONAL source with an earlier due date must not affect the REQUIRED tier's due date.
      source({ type: 'SELF_ENROLLMENT', id: 'course-1', requirement: 'OPTIONAL', dueAt: new Date('2025-01-01T00:00:00.000Z') }),
    ]);

    expect(resolution.effectiveDueAt).toEqual(earlier);
  });

  it('a source with no due date never clears one set by another in the same tier', () => {
    const dueAt = new Date('2026-03-01T00:00:00.000Z');
    const resolution = buildResolution([
      source({ type: 'DIRECT_ASSIGNMENT', id: 'a1', requirement: 'REQUIRED', dueAt }),
      source({ type: 'GROUP', id: 'a2', requirement: 'REQUIRED', dueAt: null }),
    ]);

    expect(resolution.effectiveDueAt).toEqual(dueAt);
  });

  it('effectiveDueAt is null when every source in the winning tier has no due date', () => {
    const resolution = buildResolution([source({ type: 'DEPARTMENT', id: 'a1', requirement: 'REQUIRED', dueAt: null })]);

    expect(resolution.effectiveDueAt).toBeNull();
  });

  it('display source follows DIRECT_ASSIGNMENT > DEPARTMENT > GROUP > POSITION > SELF_ENROLLMENT regardless of array order', () => {
    const resolution = buildResolution([
      source({ type: 'SELF_ENROLLMENT', id: 'course-1', requirement: 'OPTIONAL' }),
      source({ type: 'POSITION', id: 'pc-1', requirement: 'REQUIRED' }),
      source({ type: 'GROUP', id: 'a1', requirement: 'REQUIRED' }),
      source({ type: 'DEPARTMENT', id: 'a2', requirement: 'REQUIRED' }),
      source({ type: 'DIRECT_ASSIGNMENT', id: 'a3', requirement: 'REQUIRED' }),
    ]);

    expect(resolution.displaySource?.type).toBe('DIRECT_ASSIGNMENT');
    // The full list is still returned, not collapsed to just the display source.
    expect(resolution.sources).toHaveLength(5);
  });

  it('display source falls back to DEPARTMENT over GROUP when there is no direct assignment', () => {
    const resolution = buildResolution([
      source({ type: 'GROUP', id: 'a1', requirement: 'REQUIRED' }),
      source({ type: 'DEPARTMENT', id: 'a2', requirement: 'REQUIRED' }),
    ]);

    expect(resolution.displaySource?.type).toBe('DEPARTMENT');
  });
});
