import { BadRequestException } from '@nestjs/common';
import type { QuestionType, QuestionResponse } from '@lms/shared/assessment-question-types';
import type { AssessmentAnswer as CreateAssessmentAttemptAnswerInput } from '@lms/shared/assessment-question-types';
import { gradeDefinedQuestion } from './assessment-question-definition.js';

export type QuestionWithOptions = {
  id: string;
  type: QuestionType;
  definition?: unknown;
  points: number;
  scoringMode: 'all_or_nothing' | 'proportional' | 'proportional_with_penalty' | 'per_option';
  options: {
    id: string;
    isCorrect: boolean;
  }[];
};

export type GradedAnswer = {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  response?: QuestionResponse;
  isCorrect: boolean;
  score: number;
};

export function gradeAssessmentAnswers(questions: QuestionWithOptions[], answers: CreateAssessmentAttemptAnswerInput[]) {
  const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));

  if (answerByQuestionId.size !== answers.length) {
    throw new BadRequestException('Duplicate question answers are not allowed');
  }

  const questionIds = new Set(questions.map((question) => question.id));
  if (answers.some((answer) => !questionIds.has(answer.questionId))) throw new BadRequestException('Answer question does not belong to assessment');
  return questions.map((question) => {
    const answer = answerByQuestionId.get(question.id);

    if (!answer) {
      throw new BadRequestException('All assessment questions must be answered');
    }

    return gradeAnswer(question, answer);
  });
}

function gradeAnswer(question: QuestionWithOptions, answer: CreateAssessmentAttemptAnswerInput): GradedAnswer {
  if (question.definition || ['matching', 'ordering', 'fill_blank', 'short_answer'].includes(question.type)) {
    if (answer.selectedOptionId || answer.selectedOptionIds) throw new BadRequestException('Defined question requires a typed response');
    return { questionId: question.id, ...gradeDefinedQuestion(question.type, question.definition, answer.response, question.points, question.scoringMode) };
  }
  if (answer.response) throw new BadRequestException('Legacy choice question requires option ids');
  const optionIds = new Set(question.options.map((option) => option.id));
  const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);

  if (question.type === 'multiple_choice') {
    return gradeMultipleChoiceAnswer(question, answer, optionIds, correctOptionIds);
  }

  return gradeSingleChoiceAnswer(question, answer, optionIds, correctOptionIds);
}

function gradeSingleChoiceAnswer(
  question: QuestionWithOptions,
  answer: CreateAssessmentAttemptAnswerInput,
  optionIds: Set<string>,
  correctOptionIds: string[],
): GradedAnswer {
  if (!answer.selectedOptionId || answer.selectedOptionIds) {
    throw new BadRequestException('Single choice answer requires selectedOptionId');
  }

  if (!optionIds.has(answer.selectedOptionId)) {
    throw new BadRequestException('Selected option does not belong to question');
  }

  const isCorrect = correctOptionIds.length === 1 && correctOptionIds[0] === answer.selectedOptionId;

  return {
    questionId: question.id,
    selectedOptionId: answer.selectedOptionId,
    isCorrect,
    score: isCorrect ? question.points : 0,
  };
}

function gradeMultipleChoiceAnswer(
  question: QuestionWithOptions,
  answer: CreateAssessmentAttemptAnswerInput,
  optionIds: Set<string>,
  correctOptionIds: string[],
): GradedAnswer {
  if (!answer.selectedOptionIds || answer.selectedOptionId) {
    throw new BadRequestException('Multiple choice answer requires selectedOptionIds');
  }

  const selectedOptionIds = [...new Set(answer.selectedOptionIds)];

  if (selectedOptionIds.length !== answer.selectedOptionIds.length) {
    throw new BadRequestException('Duplicate selected options are not allowed');
  }

  if (selectedOptionIds.some((optionId) => !optionIds.has(optionId))) {
    throw new BadRequestException('Selected option does not belong to question');
  }

  const selected = selectedOptionIds.sort();
  const correct = [...correctOptionIds].sort();
  const isFullMatch = selected.length === correct.length && selected.every((optionId, index) => optionId === correct[index]);
  const score = scoreMultipleChoiceAnswer(question, new Set(selectedOptionIds), new Set(correctOptionIds), isFullMatch);

  return {
    questionId: question.id,
    selectedOptionIds,
    isCorrect: isFullMatch,
    score,
  };
}

/**
 * `isCorrect` always means an exact match with the correct set — score is what varies by
 * scoringMode. all_or_nothing is the only mode where a non-exact selection scores 0; the other
 * three award partial credit for a partially-correct multiple_choice selection.
 */
function scoreMultipleChoiceAnswer(
  question: QuestionWithOptions,
  selectedSet: Set<string>,
  correctSet: Set<string>,
  isFullMatch: boolean,
): number {
  const correctCount = correctSet.size;

  switch (question.scoringMode) {
    case 'all_or_nothing':
      return isFullMatch ? question.points : 0;

    case 'proportional': {
      if (correctCount === 0) return 0;
      const correctSelectedCount = [...selectedSet].filter((optionId) => correctSet.has(optionId)).length;
      return Math.round((correctSelectedCount / correctCount) * question.points);
    }

    case 'proportional_with_penalty': {
      if (correctCount === 0) return 0;
      const correctSelectedCount = [...selectedSet].filter((optionId) => correctSet.has(optionId)).length;
      const incorrectSelectedCount = selectedSet.size - correctSelectedCount;
      const ratio = Math.max(0, (correctSelectedCount - incorrectSelectedCount) / correctCount);
      return Math.round(ratio * question.points);
    }

    case 'per_option': {
      const totalOptions = question.options.length;
      if (totalOptions === 0) return 0;
      const correctJudgments = question.options.filter(
        (option) => selectedSet.has(option.id) === option.isCorrect,
      ).length;
      return Math.round((correctJudgments / totalOptions) * question.points);
    }
  }
}
