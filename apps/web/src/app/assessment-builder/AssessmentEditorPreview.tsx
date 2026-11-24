import { projectQuestionDefinition, questionDefinitionSchema, type QuestionResponse } from '@lms/shared/assessment-question-types';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../shared/apiClient.js';
import { PageState } from '../../shared/ui.js';
import type { AssessmentAttemptResult } from '../../shared/api/types.js';
import { LearnerAssessmentTakingPage } from '../LearnerAssessmentTakingPage.js';
import { buildAssessmentAnswers, type QuestionWithOptions, type SelectedAnswers } from '../assessment-taking/model.js';
import type { EditorContent, EditorDocument } from './editorModel.js';

type Grade = { questionId: string; selectedOptionId?: string; selectedOptionIds?: string[]; response?: QuestionResponse; isCorrect: boolean; score: number; reviewPending?: boolean };

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

    const policy = content.settings.policy;
    const grade = (takingQuestions: QuestionWithOptions[], selected: SelectedAnswers) => apiRequest<Grade[]>(`/assessments/${assessment.id}/editor/preview`, {
      method: 'POST',
      body: JSON.stringify({ content, questionIds: takingQuestions.map((question) => question.id), answers: buildAssessmentAnswers(takingQuestions, selected) }),
    });
    function feedback(question: EditorContent['questions'][number], isCorrect: boolean) {
      return policy?.showFeedback ? (isCorrect ? question.correctFeedback : question.incorrectFeedback) : undefined;
    }
    function key(question: EditorContent['questions'][number]) {
      return question.definition ? { correctDefinition: question.definition } : { correctOptions: question.options.filter((option) => option.isCorrect) };
    }

    return {
      assessment: { ...assessment, ...content.settings },
      questions,
      startIndex: Math.max(0, Math.min(startIndex, questions.length - 1)),
      async recordAnswer(question: QuestionWithOptions, selected: SelectedAnswers) {
        const answer = buildAssessmentAnswers([question], selected)[0];
        if (policy?.incorrectAnswer !== 'immediate') return { answer };
        const [result] = await grade([question], selected);
        if (result.reviewPending) return { answer };
        const source = content.questions.find(({ id }) => id === question.id)!;
        return { answer, isCorrect: result.isCorrect, feedback: feedback(source, result.isCorrect),
          ...(!result.isCorrect ? key(source) : {}) };
      },
      async submit(takingQuestions: QuestionWithOptions[], selected: SelectedAnswers) {
        const graded = await grade(takingQuestions, selected);
        const maxScore = takingQuestions.reduce((sum, question) => sum + question.points, 0);
        const score = graded.reduce((sum, answer) => sum + answer.score, 0);
        const percentage = maxScore ? Math.round(score / maxScore * 100) : 0;
        const answers: AssessmentAttemptResult['answers'] = graded.flatMap((answer) => {
          const question = questions.find((item) => item.id === answer.questionId);
          if (!question) return [];
          const source = content.questions[question.order];
          const reveal = (policy?.answerVisibility ?? (content.settings.showCorrectAnswers ? 'submitted' : 'never')) === 'submitted'
            || (policy?.answerVisibility === 'last' && content.settings.maxAttempts === 1)
            || (!answer.isCorrect && policy?.incorrectAnswer === 'review');
          return [{
            ...answer, id: question.id,
            selectedOptionId: answer.selectedOptionId ?? null,
            selectedOptionIds: answer.selectedOptionIds ?? null,
            selectedOption: question.options.find((option) => option.id === answer.selectedOptionId) ?? null,
            question, feedback: feedback(source, answer.isCorrect),
            ...(reveal ? key(source) : {}),
          }];
        });
        return {
          ...(graded.some((answer) => answer.reviewPending) ? { status: 'pending_review' } : {}),
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
