-- Preserve the review policy visible when this migration runs for all existing
-- non-longread attempts. Fill any missing snapshots from the available rows,
-- including attempts submitted by the old API during the earlier rollout.
-- Scores, responses and timestamps are retained.
UPDATE assessment_attempt_answers AS answer
SET frozen_question = COALESCE(answer.frozen_question, jsonb_build_object(
    'question', jsonb_build_object(
      'id', question.id,
      'type', question.type,
      'title', question.title,
      'text', question.text,
      'imageUrl', question.image_url,
      'order', question."order",
      'points', question.points,
      'scoringMode', question.scoring_mode,
      'definition', question.definition,
      'correctFeedback', question.correct_feedback,
      'incorrectFeedback', question.incorrect_feedback,
      'options', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', option.id,
          'text', option.text,
          'imageUrl', option.image_url,
          'order', option."order",
          'isCorrect', option.is_correct AND option.deleted_at IS NULL
        ) ORDER BY option."order", option.id)
        FROM assessment_answer_options AS option
        WHERE option.question_id = question.id
          AND (
            option.deleted_at IS NULL
            OR option.id = answer.selected_option_id
            OR answer.selected_option_ids ? option.id::text
          )
      ), '[]'::jsonb),
      'assessment', jsonb_build_object(
        'id', assessment.id,
        'title', assessment.title,
        'passingScore', assessment.passing_score,
        'maxAttempts', assessment.max_attempts
      )
    ),
    'revealAnswers', false
  )) || jsonb_build_object(
  'resultSettings', jsonb_build_object(
    'passMessage', assessment.pass_message,
    'failMessage', assessment.fail_message,
    'showCorrectAnswers', assessment.show_correct_answers,
    'policy', assessment.policy
  )
)
FROM assessment_attempts AS attempt
JOIN assessments AS assessment ON assessment.id = attempt.assessment_id,
assessment_questions AS question
WHERE answer.attempt_id = attempt.id
  AND answer.question_id = question.id
  AND attempt.longread_revision_id IS NULL
  AND answer.deleted_at IS NULL
  AND (answer.frozen_question IS NULL OR NOT answer.frozen_question ? 'resultSettings');
