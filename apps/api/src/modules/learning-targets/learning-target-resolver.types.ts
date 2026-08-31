export type LearningTargetRequirement = 'REQUIRED' | 'OPTIONAL';

export type LearningTargetSourceType = 'DIRECT_ASSIGNMENT' | 'GROUP' | 'DEPARTMENT' | 'POSITION' | 'SELF_ENROLLMENT';

export type LearningTargetSource = {
  type: LearningTargetSourceType;
  /** Stable id of the record this source came from -- used for dedupe, never shown as-is to a learner. */
  id: string;
  requirement: LearningTargetRequirement;
  dueAt: Date | null;
};

/**
 * Display-only ranking, distinct from which source(s) determine effectiveRequirement/
 * effectiveDueAt (plan: "resolver обязан вернуть полный sources[]" even though only one is
 * shown). Order fixed by the plan: DIRECT_ASSIGNMENT > DEPARTMENT > GROUP > POSITION >
 * SELF_ENROLLMENT.
 */
export const DISPLAY_SOURCE_PRECEDENCE: readonly LearningTargetSourceType[] = [
  'DIRECT_ASSIGNMENT',
  'DEPARTMENT',
  'GROUP',
  'POSITION',
  'SELF_ENROLLMENT',
];

export type LearningTargetResolution = {
  sources: LearningTargetSource[];
  isEntitled: boolean;
  effectiveRequirement: LearningTargetRequirement | null;
  effectiveDueAt: Date | null;
  displaySource: LearningTargetSource | null;
};

export function buildResolution(sources: LearningTargetSource[]): LearningTargetResolution {
  if (sources.length === 0) {
    return { sources, isEntitled: false, effectiveRequirement: null, effectiveDueAt: null, displaySource: null };
  }

  // REQUIRED beats OPTIONAL (plan). Within the winning tier, the effective due date is the
  // earliest non-null one -- a source with no due date never "clears" one set by another.
  const effectiveRequirement: LearningTargetRequirement = sources.some((source) => source.requirement === 'REQUIRED')
    ? 'REQUIRED'
    : 'OPTIONAL';
  const winningTier = sources.filter((source) => source.requirement === effectiveRequirement);
  const dueDates = winningTier.map((source) => source.dueAt).filter((dueAt): dueAt is Date => dueAt !== null);
  const effectiveDueAt = dueDates.length === 0 ? null : new Date(Math.min(...dueDates.map((date) => date.getTime())));

  let displaySource: LearningTargetSource | null = null;
  for (const type of DISPLAY_SOURCE_PRECEDENCE) {
    const match = sources.find((source) => source.type === type);
    if (match) {
      displaySource = match;
      break;
    }
  }

  return { sources, isEntitled: true, effectiveRequirement, effectiveDueAt, displaySource };
}
