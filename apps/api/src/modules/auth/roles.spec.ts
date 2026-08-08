import { isLearnerOnly, rolePolicies, type UserRole } from './roles.js';

type PolicyName = keyof typeof rolePolicies;

const allRoles: UserRole[] = ['admin', 'manager', 'instructor', 'learner'];

function expectPolicy(policyName: PolicyName, allowedRoles: readonly UserRole[]) {
  const expectedRoles = new Set(allowedRoles);

  for (const role of allRoles) {
    if (expectedRoles.has(role)) {
      expect(rolePolicies[policyName]).toContain(role);
    } else {
      expect(rolePolicies[policyName]).not.toContain(role);
    }
  }
}

describe('isLearnerOnly', () => {
  it('returns true for a user with only the learner role', () => {
    expect(isLearnerOnly(['learner'])).toBe(true);
  });

  it('returns false for admin', () => {
    expect(isLearnerOnly(['admin'])).toBe(false);
  });

  it('returns false for manager', () => {
    expect(isLearnerOnly(['manager'])).toBe(false);
  });

  it('returns false for instructor', () => {
    expect(isLearnerOnly(['instructor'])).toBe(false);
  });

  it('returns false for admin who also has learner role', () => {
    expect(isLearnerOnly(['learner', 'admin'])).toBe(false);
  });

  it('returns false for instructor who also has learner role', () => {
    expect(isLearnerOnly(['learner', 'instructor'])).toBe(false);
  });
});

describe('rolePolicies', () => {
  const learnerReadPolicies = [
    'coursesRead',
    'lessonsRead',
    'courseMaterialsRead',
    'assignmentsRead',
    'progressRead',
    'assessmentsRead',
    'assessmentAttemptResultsRead',
    'certificatesRead',
  ] as const;

  it.each(learnerReadPolicies)('allows learners to read %s for MVP learner routes', (policyName) => {
    expect(rolePolicies[policyName]).toContain('learner');
  });

  it('allows learners to create progress for lesson completion', () => {
    expect(rolePolicies.progressCreate).toContain('learner');
  });

  it('allows learners to create assessment attempts for learner quizzes', () => {
    expect(rolePolicies.assessmentAttemptsCreate).toContain('learner');
  });

  it.each([
    'coursesCreate',
    'lessonsCreate',
    'courseMaterialsCreate',
    'assignmentsCreate',
    'assessmentsCreate',
    'assessmentQuestionsCreate',
    'assessmentAnswerOptionsCreate',
    'certificatesCreate',
  ] as const)('does not allow learners to create admin-authored content via %s', (policyName) => {
    expect(rolePolicies[policyName]).not.toContain('learner');
  });

  // Every key of `rolePolicies` must have an entry here. `satisfies Record<PolicyName, ...>` is a
  // type-level nudge in the editor, but apps/api/tsconfig.json excludes *.spec.ts from the
  // `typecheck` script, so it is NOT enforced by CI's typecheck step — the completeness test right
  // below this map is what actually catches a missing key, as a normal failing test. Verified by
  // temporarily deleting an entry and confirming the runtime test (not tsc) fails.
  // This replaces a fixed hand-maintained array that could silently omit new policies — see
  // docs/CONCERNS.md and docs/API_RBAC_MATRIX.md "Enforcement" for the history of that drift.
  const expectedRolePolicies = {
    organizationsRead: ['admin'],
    organizationsCreate: ['admin'],
    themeSettingsRead: ['admin', 'manager', 'instructor', 'learner'],
    themeSettingsWrite: ['admin'],
    usersRead: ['admin', 'manager'],
    usersCreate: ['admin', 'manager'],
    membershipsRead: ['admin', 'manager'],
    membershipsCreate: ['admin'],
    groupsRead: ['admin', 'manager'],
    groupsCreate: ['admin', 'manager'],
    coursesRead: ['admin', 'manager', 'instructor', 'learner'],
    coursesCreate: ['admin', 'instructor'],
    lessonsRead: ['admin', 'manager', 'instructor', 'learner'],
    lessonsReadAll: ['admin'],
    lessonsCreate: ['admin', 'instructor'],
    courseMaterialsRead: ['admin', 'manager', 'instructor', 'learner'],
    courseMaterialsCreate: ['admin', 'instructor'],
    assignmentsRead: ['admin', 'manager', 'instructor', 'learner'],
    assignmentsCreate: ['admin', 'manager', 'instructor'],
    progressRead: ['admin', 'manager', 'instructor', 'learner'],
    progressCreate: ['admin', 'manager', 'instructor', 'learner'],
    assessmentsRead: ['admin', 'manager', 'instructor', 'learner'],
    assessmentsCreate: ['admin', 'instructor'],
    assessmentQuestionsRead: ['admin', 'manager', 'instructor'],
    assessmentQuestionsCreate: ['admin', 'instructor'],
    assessmentAnswerOptionsRead: ['admin', 'manager', 'instructor'],
    assessmentAnswerOptionsCreate: ['admin', 'instructor'],
    assessmentAttemptsRead: ['admin', 'manager', 'instructor'],
    assessmentAttemptResultsRead: ['admin', 'manager', 'instructor', 'learner'],
    assessmentAttemptsCreate: ['admin', 'manager', 'instructor', 'learner'],
    certificatesRead: ['admin', 'manager', 'instructor', 'learner'],
    certificatesCreate: ['admin', 'manager', 'instructor'],
    managerTeamSummaryRead: ['admin', 'manager'],
  } satisfies Record<PolicyName, readonly UserRole[]>;

  it('has an expected-roles entry for every key of rolePolicies (and no extra ones)', () => {
    expect(Object.keys(expectedRolePolicies).sort()).toEqual(Object.keys(rolePolicies).sort());
  });

  it.each(Object.entries(expectedRolePolicies) as [PolicyName, readonly UserRole[]][])(
    'matches the audited RBAC matrix for %s',
    (policyName, allowedRoles) => {
      expectPolicy(policyName, allowedRoles);
    },
  );
});
