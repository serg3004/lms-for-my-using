import { type FormEvent, useEffect, useState } from 'react';

import { apiRequest, getAssessment, type AssessmentSummary } from '../shared/apiClient.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';

type Question = {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false';
  title: string;
  text: string | null;
  points: number;
  order: number;
};

type Option = {
  id: string;
  text: string | null;
  imageUrl: string | null;
};

type QuestionWithOptions = Question & { options: Option[] };
type SelectedAnswers = Record<string, string | string[]>;

type Result = {
  id: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; assessment: AssessmentSummary; questions: QuestionWithOptions[] }
  | { status: 'error'; message: string };

function selectedIds(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : [];
}

function buildAnswers(questions: QuestionWithOptions[], selectedAnswers: SelectedAnswers) {
  return questions.map((question) => {
    const value = selectedAnswers[question.id];

    if (question.type === 'multiple_choice') {
      return { questionId: question.id, selectedOptionIds: selectedIds(value) };
    }

    return { questionId: question.id, selectedOptionId: typeof value === 'string' ? value : undefined };
  });
}

function hasMissingAnswers(questions: QuestionWithOptions[], selectedAnswers: SelectedAnswers) {
  return questions.some((question) => {
    const value = selectedAnswers[question.id];

    if (question.type === 'multiple_choice') {
      return selectedIds(value).length === 0;
    }

    return !value || Array.isArray(value);
  });
}

export function LearnerAssessmentTakingPage({ assessmentId }: { assessmentId: string }) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [selectedAnswers, setSelectedAnswers] = useState<SelectedAnswers>({});
  const [result, setResult] = useState<Result | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadAssessment() {
      try {
        const assessment = await getAssessment(assessmentId);
        const questions = await apiRequest<Question[]>(`/assessments/${encodeURIComponent(assessmentId)}/questions`);
        const questionsWithOptions = await Promise.all(
          questions
            .slice()
            .sort((left, right) => left.order - right.order)
            .map(async (question) => ({
              ...question,
              options: await apiRequest<Option[]>(`/questions/${encodeURIComponent(question.id)}/options`),
            })),
        );

        if (isMounted) {
          setLoadState({ status: 'loaded', assessment, questions: questionsWithOptions });
        }
      } catch {
        if (isMounted) {
          setLoadState({ status: 'error', message: 'Unable to load assessment.' });
        }
      }
    }

    void loadAssessment();

    return () => {
      isMounted = false;
    };
  }, [assessmentId]);

  function selectSingle(questionId: string, optionId: string) {
    setSelectedAnswers((current) => ({ ...current, [questionId]: optionId }));
  }

  function selectMultiple(questionId: string, optionId: string, checked: boolean) {
    setSelectedAnswers((current) => {
      const values = selectedIds(current[questionId]);
      const nextValues = checked ? [...values, optionId] : values.filter((id) => id !== optionId);

      return { ...current, [questionId]: nextValues };
    });
  }

  async function submitAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded') {
      return;
    }

    if (loadState.questions.length === 0 || hasMissingAnswers(loadState.questions, selectedAnswers)) {
      setErrorMessage('Answer all questions before submitting.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const attempt = await apiRequest<{ id: string }>(`/assessments/${encodeURIComponent(assessmentId)}/attempts`, {
        method: 'POST',
        body: JSON.stringify({ answers: buildAnswers(loadState.questions, selectedAnswers) }),
      });
      setResult(await apiRequest<Result>(`/attempts/${encodeURIComponent(attempt.id)}/result`));
    } catch {
      setErrorMessage('Unable to submit assessment attempt.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main>
        <PageState message="Loading assessment..." variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main>
        <PageState message={loadState.message} title="Take assessment" variant="error" />
      </main>
    );
  }

  if (result) {
    return (
      <main>
        <nav>
          <a href="/learn/assessments">Assessments</a>
          <a href={`/learn/assessments/${encodeURIComponent(assessmentId)}`}>Assessment details</a>
        </nav>
        <article>
          <h1>Assessment result</h1>
          <p>
            {result.score}/{result.maxScore} · {result.percentage}%
          </p>
          <StatusBadge>{result.passed ? 'passed' : 'failed'}</StatusBadge>
        </article>
      </main>
    );
  }

  return (
    <main>
      <nav>
        <a href="/learn/assessments">Assessments</a>
        <a href={`/learn/assessments/${encodeURIComponent(assessmentId)}`}>Assessment details</a>
      </nav>

      <article>
        <h1>{loadState.assessment.title}</h1>
        <p>{loadState.assessment.description?.trim() || loadState.assessment.slug}</p>
        <p>Passing score: {loadState.assessment.passingScore}%</p>
      </article>

      {loadState.questions.length === 0 ? (
        <EmptyState message="No questions found for this assessment." />
      ) : (
        <form onSubmit={submitAttempt}>
          {loadState.questions.map((question) => (
            <fieldset key={question.id}>
              <legend>
                {question.order}. {question.title}
              </legend>
              {question.text ? <p>{question.text}</p> : null}
              <p>Points: {question.points}</p>

              {question.options.map((option) => {
                const label = option.text || option.imageUrl || option.id;

                if (question.type === 'multiple_choice') {
                  return (
                    <label key={option.id}>
                      <input
                        checked={selectedIds(selectedAnswers[question.id]).includes(option.id)}
                        onChange={(event) => selectMultiple(question.id, option.id, event.target.checked)}
                        type="checkbox"
                      />
                      {label}
                    </label>
                  );
                }

                return (
                  <label key={option.id}>
                    <input
                      checked={selectedAnswers[question.id] === option.id}
                      name={question.id}
                      onChange={() => selectSingle(question.id, option.id)}
                      type="radio"
                    />
                    {label}
                  </label>
                );
              })}
            </fieldset>
          ))}

          {errorMessage ? <p role="alert">{errorMessage}</p> : null}

          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Submitting...' : 'Submit assessment'}
          </button>
        </form>
      )}
    </main>
  );
}
