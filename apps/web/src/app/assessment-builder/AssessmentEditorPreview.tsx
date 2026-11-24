import { projectQuestionDefinition, questionDefinitionSchema, type QuestionResponse } from '@lms/shared/assessment-question-types';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../shared/apiClient.js';
import { PageState } from '../../shared/ui.js';
import type { AssessmentAttemptResult } from '../../shared/api/types.js';
import { LearnerAssessmentTakingPage } from '../LearnerAssessmentTakingPage.js';
import { buildAssessmentAnswers, type QuestionWithOptions, type SelectedAnswers } from '../assessment-taking/model.js';
import type { EditorContent, EditorDocument } from './editorModel.js';

type Grade = { questionId: string; selectedOptionId?: string; selectedOptionIds?: string[]; response?: QuestionResponse; isCorrect: boolean; score: number };

export function AssessmentEditorPreview({ assessment, content, startIndex }: {
  assessment: EditorDocument['assessment'];
  content: EditorContent | null;
  startIndex: number;
}) {
  const { t } = useTranslation();
  const preview = useMemo(() => {
    if (!content || content.questions.some((question) => question.definition && !questionDefinitionSchema.safeParse(question.definition).success)) return null;
    const questions = content.questions.map((question, order) => ({
      ...question,
      order,
      definition: question.definition ? projectQuestionDefinition(question.definition, (items) => items
        .map((item) => ({ item, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ item }) => item)) : undefined,
      options: question.options.map((option, optionOrder) => ({ ...option, questionId: question.id, order: optionOrder })),
    }));

    return {
      assessment: { ...assessment, ...content.settings, maxAttempts: content.settings.maxAttempts ?? assessment.maxAttempts },
      questions,
      startIndex: Math.max(0, Math.min(startIndex, questions.length - 1)),
      async submit(takingQuestions: QuestionWithOptions[], selected: SelectedAnswers) {
        const graded = await apiRequest<Grade[]>(`/assessments/${assessment.id}/editor/preview`, {
          method: 'POST',
          body: JSON.stringify({
            content, questionIds: takingQuestions.map((question) => question.id),
            answers: buildAssessmentAnswers(takingQuestions, selected),
          }),
        });
        const maxScore = takingQuestions.reduce((sum, question) => sum + question.points, 0);
        const score = graded.reduce((sum, answer) => sum + answer.score, 0);
        const percentage = maxScore ? Math.round(score / maxScore * 100) : 0;
        const answers: AssessmentAttemptResult['answers'] = graded.flatMap((answer) => {
          const question = questions.find((item) => item.id === answer.questionId);
          if (!question) return [];
          return [{
            ...answer, id: question.id,
            selectedOptionId: answer.selectedOptionId ?? null,
            selectedOptionIds: answer.selectedOptionIds ?? null,
            selectedOption: question.options.find((option) => option.id === answer.selectedOptionId) ?? null,
            ...(content.settings.showCorrectAnswers ? { correctOptions: question.options.filter((option) => option.isCorrect) } : {}),
            question,
            ...(content.settings.showCorrectAnswers && content.questions[question.order].definition
              ? { correctDefinition: content.questions[question.order].definition! } : {}),
          }];
        });
        return {
          answers, score, maxScore, percentage, passed: percentage >= content.settings.passingScore,
          assessment: { ...assessment, ...content.settings },
        };
      },
    };
  }, [assessment, content, startIndex]);

  return preview
    ? <LearnerAssessmentTakingPage assessmentId={assessment.id} preview={preview} />
    : <PageState variant="error" message={t('admin.assessmentBuilder.editor.invalidFields')} />;
}
