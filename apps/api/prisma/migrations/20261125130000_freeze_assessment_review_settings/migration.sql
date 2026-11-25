-- Preserve the review policy visible when this migration runs for all existing
-- non-longread answer snapshots. Scores, responses and timestamps are retained.
UPDATE assessment_attempt_answers AS answer
SET frozen_question = answer.frozen_question || jsonb_build_object(
  'resultSettings', jsonb_build_object(
    'passMessage', assessment.pass_message,
    'failMessage', assessment.fail_message,
    'showCorrectAnswers', assessment.show_correct_answers,
    'policy', assessment.policy
  )
)
FROM assessment_attempts AS attempt
JOIN assessments AS assessment ON assessment.id = attempt.assessment_id
WHERE answer.attempt_id = attempt.id
  AND attempt.longread_revision_id IS NULL
  AND answer.deleted_at IS NULL
  AND answer.frozen_question IS NOT NULL
  AND NOT answer.frozen_question ? 'resultSettings';
