import { rolePolicies } from './roles.js';

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
});
