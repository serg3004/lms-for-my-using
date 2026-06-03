import { rolePolicies, type UserRole } from './roles.js';

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

  it.each([
    'coursesCreate',
    'lessonsCreate',
    'courseMaterialsCreate',
    'assignmentsCreate',
    'assessmentsCreate',
    'assessmentQuestionsCreate',
    'assessmentAnswerOptionsCreate',
  ] as const)('does not allow learners to create admin-authored content via %s', (policyName) => {
    expect(rolePolicies[policyName]).not.toContain('learner');
  });

  it.each([
    ['organizationsRead', ['admin']],
    ['usersRead', ['admin', 'manager']],
    ['usersCreate', ['admin', 'manager']],
    ['membershipsRead', ['admin', 'manager']],
    ['membershipsCreate', ['admin']],
    ['groupsRead', ['admin', 'manager']],
    ['groupsCreate', ['admin', 'manager']],
    ['coursesRead', ['admin', 'manager', 'instructor', 'learner']],
    ['coursesCreate', ['admin', 'instructor']],
    ['lessonsRead', ['admin', 'manager', 'instructor', 'learner']],
    ['lessonsCreate', ['admin', 'instructor']],
    ['courseMaterialsRead', ['admin', 'manager', 'instructor', 'learner']],
    ['courseMaterialsCreate', ['admin', 'instructor']],
    ['assignmentsRead', ['admin', 'manager', 'instructor', 'learner']],
    ['assignmentsCreate', ['admin', 'manager', 'instructor']],
    ['progressRead', ['admin', 'manager', 'instructor', 'learner']],
    ['progressCreate', ['admin', 'manager', 'instructor', 'learner']],
    ['assessmentsRead', ['admin', 'manager', 'instructor', 'learner']],
    ['assessmentsCreate', ['admin', 'instructor']],
    ['assessmentQuestionsRead', ['admin', 'manager', 'instructor']],
    ['assessmentQuestionsCreate', ['admin', 'instructor']],
    ['assessmentAnswerOptionsRead', ['admin', 'manager', 'instructor']],
    ['assessmentAnswerOptionsCreate', ['admin', 'instructor']],
    ['assessmentAttemptsRead', ['admin', 'manager', 'instructor']],
    ['assessmentAttemptResultsRead', ['admin', 'manager', 'instructor', 'learner']],
    ['assessmentAttemptsCreate', ['admin', 'manager', 'instructor', 'learner']],
    ['certificatesRead', ['admin', 'manager', 'instructor', 'learner']],
    ['certificatesCreate', ['admin', 'manager', 'instructor', 'learner']],
  ] satisfies readonly [PolicyName, readonly UserRole[]][])(
    'matches the audited learner/admin RBAC matrix for %s',
    (policyName, allowedRoles) => {
      expectPolicy(policyName, allowedRoles);
    },
  );
});
