import { useEffect, useRef, useState } from 'react';
import { saveAssessmentDraftAnswer } from '../../shared/api/assessments.js';
import { draftAssessmentAnswerSchema } from '@lms/shared/assessment-question-types';
import { buildAssessmentAnswers, isQuestionAnswered, type QuestionWithOptions, type SelectedAnswers } from './model.js';

function writeStorage(key: string, value: SelectedAnswers) {
  try {
    if (Object.keys(value).length) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // Autosave can operate without browser storage.
  }
}

export function readAssessmentDraft(attemptId: string): SelectedAnswers {
  try {
    return JSON.parse(localStorage.getItem(`assessment-draft:${attemptId}`) ?? '{}') as SelectedAnswers;
  } catch {
    return {};
  }
}

export function useAssessmentDraft(assessmentId: string, attemptId: string | undefined, token: string | undefined,
  questions: QuestionWithOptions[], locked: boolean, paused: boolean) {
  const saved = useRef<SelectedAnswers>({});
  const [pending, setPending] = useState<SelectedAnswers>({});
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  const key = `assessment-draft:${attemptId}`;

  function replace(next: SelectedAnswers) {
    saved.current = next;
    setPending(next);
    if (attemptId) writeStorage(key, next);
  }

  function restore(id: string) {
    const next = readAssessmentDraft(id);
    saved.current = next;
    setPending(next);
    return next;
  }

  useEffect(() => {
    const retryOnline = () => setRetry((value) => value + 1);
    window.addEventListener('online', retryOnline);
    return () => window.removeEventListener('online', retryOnline);
  }, []);

  useEffect(() => {
    if (!attemptId || locked || paused || !Object.keys(pending).length) return;
    const timer = window.setTimeout(async () => {
      if (busy.current) return;
      busy.current = true;
      let success = false;
      try {
        for (const [id, value] of Object.entries(pending)) {
          const question = questions.find((item) => item.id === id);
          if (!question) continue;
          const complete = isQuestionAnswered(question, value);
          const answer = complete ? buildAssessmentAnswers([question], { [id]: value })[0]!
            : typeof value === 'object' && !Array.isArray(value) ? { questionId: id, response: value }
              : { questionId: id, clear: true as const };
          if (!('clear' in answer) && !draftAssessmentAnswerSchema.safeParse(answer).success) continue;
          await saveAssessmentDraftAnswer(assessmentId, attemptId, answer, token);
          if (saved.current[id] === value) {
            const next = { ...saved.current };
            delete next[id];
            saved.current = next;
            writeStorage(key, next);
          }
        }
        success = true;
        setFailed(false);
      } catch {
        setFailed(true);
      } finally {
        busy.current = false;
        if (success) setPending((current) => Object.fromEntries(Object.entries(current)
          .filter(([id, value]) => pending[id] !== value)));
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [assessmentId, attemptId, key, locked, paused, pending, questions, retry, token]);

  return {
    restore, failed, retry: () => setRetry((value) => value + 1),
    change(id: string, value: SelectedAnswers[string]) { replace({ ...saved.current, [id]: value }); },
    acknowledge(id: string) {
      const next = { ...saved.current };
      delete next[id];
      replace(next);
    },
    clear() { replace({}); },
  };
}
