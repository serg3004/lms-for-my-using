import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../shared/apiClient.js';
import { DictationButton } from '../shared/DictationButton.js';
import { appendDictation } from '../shared/dictation.js';
import { useOrgDictation } from '../shared/useOrgDictation.js';

type ReviewAnswer = {
  id: string;
  employee: { firstName: string; lastName: string };
  assessment: string;
  question: string;
  response: string;
  dueAt: string;
  maxScore: number;
  canReview: boolean;
};
type Queue = { answers: ReviewAnswer[]; next: string | null };

export function AssessmentReviewQueuePage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dictation = useOrgDictation();
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const answerId = params.get('answerId');
  const query = params.toString();
  const filters = new URLSearchParams(params);
  filters.delete('answerId');

  useEffect(() => {
    const controller = new AbortController();
    setQueue(null);
    setError(false);
    void apiRequest<Queue>(`/assessment-reviews?${query}`, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setQueue(value); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [query]);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['assessment', 'department']) {
      const value = String(fields.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    const due = fields.get('dueBefore');
    if (due) next.set('dueBefore', new Date(`${due}T23:59:59.999`).toISOString());
    setSaved(false);
    setParams(next);
  }

  async function review(event: FormEvent<HTMLFormElement>, answer: ReviewAnswer) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError(false);
    try {
      await apiRequest(`/assessment-reviews/${answer.id}`, {
        method: 'POST', body: JSON.stringify({ score: Number(fields.get('score')), comment: String(fields.get('comment') ?? '') }),
      });
      setSaved(true);
      setParams(filters);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return <section>
    <h1>{t('assessmentReview.title')}</h1>
    {error && <p role="alert">{t('assessmentReview.error')}</p>}
    {saved && !answerId && <p role="status">{t('assessmentReview.saved')}</p>}
    {answerId ? <Link to={`?${filters}`}>{t('assessmentReview.back')}</Link> : <form key={query} onSubmit={filter} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
      <label>{t('assessmentReview.assessment')} <input name="assessment" maxLength={200} defaultValue={params.get('assessment') ?? ''} /></label>
      <label>{t('assessmentReview.department')} <input name="department" maxLength={200} defaultValue={params.get('department') ?? ''} /></label>
      <label>{t('assessmentReview.dueBefore')} <input name="dueBefore" type="date" defaultValue={params.get('dueBefore')?.slice(0, 10)} /></label>
      <button className="learner-btn learner-btn--secondary" type="submit">{t('assessmentReview.filter')}</button>
    </form>}
    {queue && !queue.answers.length && <p>{t('assessmentReview.empty')}</p>}
    {queue && !answerId && <ul>
      {queue.answers.map((answer) => {
        const detail = new URLSearchParams(filters);
        detail.set('answerId', answer.id);
        return <li key={answer.id} style={{ overflowWrap: 'anywhere' }}>
          <Link to={`?${detail}`}>{answer.assessment} · {answer.employee.firstName} {answer.employee.lastName} · {answer.question}</Link>
          {' · '}<time dateTime={answer.dueAt}>{new Date(answer.dueAt).toLocaleDateString(i18n.language)}</time>
        </li>;
      })}
    </ul>}
    {queue && !answerId && queue.next && <button type="button" className="learner-btn learner-btn--secondary" onClick={() => {
      filters.set('after', queue.next!);
      setParams(filters);
    }}>{t('assessmentReview.next')}</button>}
    {answerId && queue?.answers[0] && (() => {
      const answer = queue.answers[0];
      return <article key={answer.id} style={{ overflowWrap: 'anywhere' }}>
        <h2>{answer.question}</h2>
        <p>{answer.employee.firstName} {answer.employee.lastName} · {answer.assessment}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{answer.response}</p>
        {answer.canReview && <form onSubmit={(event) => void review(event, answer)}>
          <p><label>{t('assessmentReview.score', { max: answer.maxScore })} <input name="score" type="number" min={0} max={answer.maxScore} step={1} required /></label></p>
          <p><label>{t('assessmentReview.comment')} <textarea name="comment" maxLength={4000} ref={commentRef} rows={4} style={{ maxWidth: '100%' }} /></label></p>
          {dictation && <p><DictationButton id="assessment-review-comment" onText={(text) => { if (commentRef.current) commentRef.current.value = appendDictation(commentRef.current.value, text, 4000); }} /></p>}
          <button className="learner-btn learner-btn--primary" type="submit" disabled={saving}>{t('assessmentReview.save')}</button>
        </form>}
      </article>;
    })()}
  </section>;
}
