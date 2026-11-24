import { questionDefinitionSchema } from '@lms/shared/assessment-question-types';

export function publicAnswerKey(question: {
  definition?: unknown;
  options: { id: string; isCorrect: boolean; text: string | null; imageUrl: string | null }[];
}) {
  const definition = questionDefinitionSchema.safeParse(question.definition);
  return definition.success ? { correctDefinition: definition.data } : {
    correctOptions: question.options.filter(({ isCorrect }) => isCorrect).map(({ id, text, imageUrl }) => ({ id, text, imageUrl })),
  };
}
