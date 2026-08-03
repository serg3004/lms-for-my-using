import { ApiClientError } from '../../shared/apiClient.js';

export type AssessmentQuestion = {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false';
  title: string;
  text: string | null;
  points: number;
  order: number;
};

export type AssessmentOption = {
  id: string;
  questionId: string;
  text: string | null;
  imageUrl: string | null;
  order: number;
};

export type QuestionWithOptions = AssessmentQuestion & { options: AssessmentOption[] };
export type SelectedAnswers = Record<string, string | string[]>;

export function selectedIds(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

export function buildAssessmentAnswers(questions: QuestionWithOptions[], selected: SelectedAnswers) {
  return questions.map((question) => {
    const value = selected[question.id];
    if (question.type === 'multiple_choice') {
      return { questionId: question.id, selectedOptionIds: selectedIds(value) };
    }
    return { questionId: question.id, selectedOptionId: typeof value === 'string' ? value : undefined };
  });
}

export function countAnsweredQuestions(questions: QuestionWithOptions[], selected: SelectedAnswers): number {
  return questions.filter((question) => {
    const value = selected[question.id];
    return question.type === 'multiple_choice' ? selectedIds(value).length > 0 : typeof value === 'string';
  }).length;
}

export function getAssessmentSubmitErrorKey(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'assessments.sessionExpired';
    if (error.status === 400) {
      const message = error.message.toLowerCase();
      if (message.includes('attempts limit')) return 'assessments.errorAttemptsLimit';
      if (message.includes('course must be completed')) return 'assessments.errorCourseNotComplete';
      if (message.includes('must be published')) return 'assessments.errorNotPublished';
    }
  }
  return 'assessments.errorSubmit';
}

export function getAssessmentOptionLabel(
  option: Pick<AssessmentOption, 'id' | 'text' | 'imageUrl'>,
): string {
  return option.text ?? option.imageUrl ?? option.id;
}
