import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssessmentAnswer, QuestionResponse } from '@lms/shared/assessment-question-types';
import type { PublicExerciseQuestion } from '@lms/shared/longread-exercises';

const control = { minHeight: 44, width: '100%', maxWidth: '100%' };
export function exerciseAnswerComplete(question: PublicExerciseQuestion, answer: AssessmentAnswer | null): boolean {
  if (!answer || answer.questionId !== question.id) return false;
  if (!question.definition) return question.type === 'multiple_choice' ? !!answer.selectedOptionIds?.length : !!answer.selectedOptionId;
  const response = answer.response, definition = question.definition;
  if (!response || response.type !== definition.type) return false;
  if (response.type === 'true_false' || response.type === 'short_answer') return true;
  if (response.type === 'matching' && definition.type === 'matching') return response.pairs.length === definition.left.length && new Set(response.pairs.map((pair) => pair.rightId)).size === definition.right.length;
  if (response.type === 'ordering' && definition.type === 'ordering') return response.itemIds.length === definition.items.length && response.itemIds.every(Boolean) && new Set(response.itemIds).size === response.itemIds.length;
  return response.type === 'fill_blank' && definition.type === 'fill_blank' && response.blanks.length === definition.blanks.length;
}
export function QuestionResponseFields({ question, answer, onChange, disabled = false }: { question: PublicExerciseQuestion; answer: AssessmentAnswer | null; onChange: (answer: AssessmentAnswer) => void; disabled?: boolean }) {
  const { t } = useTranslation(), id = useId();
  const response = answer?.response, definition = question.definition;
  const set = (value: QuestionResponse) => onChange({ questionId: question.id, response: value });
  return <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <legend>{t('longreadExercises.yourAnswer')}</legend>
    {!definition && <div style={{ display: 'grid', gap: 8 }}>{question.options.map((option, index) => <label key={option.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, overflowWrap: 'anywhere' }}>
      <input type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'} name={`${id}-choice`} style={{ width: 'auto' }}
        checked={question.type === 'multiple_choice' ? answer?.selectedOptionIds?.includes(option.id) ?? false : answer?.selectedOptionId === option.id}
        onChange={(event) => question.type === 'multiple_choice' ? onChange({ questionId: question.id, selectedOptionIds: event.target.checked ? [...(answer?.selectedOptionIds ?? []), option.id] : (answer?.selectedOptionIds ?? []).filter((value) => value !== option.id) }) : onChange({ questionId: question.id, selectedOptionId: option.id })} />
      <span style={{ minWidth: 0 }}>{option.imageUrl && <img src={option.imageUrl} alt={option.text ?? t('longreadExercises.option', { number: index + 1 })} style={{ maxWidth: '100%', maxHeight: 240 }} />}{option.text ?? t('longreadExercises.option', { number: index + 1 })}</span>
    </label>)}</div>}
    {definition?.type === 'true_false' && <div>{[true, false].map((value) => <label key={String(value)} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <input type="radio" name={`${id}-boolean`} style={{ width: 'auto' }} checked={response?.type === 'true_false' && response.value === value} onChange={() => set({ type: 'true_false', value })} />{t(value ? 'longreadExercises.true' : 'longreadExercises.false')}
    </label>)}</div>}
    {definition?.type === 'matching' && <div style={{ display: 'grid', gap: 12 }}>{definition.left.map((left, index) => {
      const pairs = response?.type === 'matching' ? response.pairs : [], selected = pairs.find((pair) => pair.leftId === left.id)?.rightId ?? '';
      return <div key={left.id}><label htmlFor={`${id}-match-${index}`}>{left.text}</label><select id={`${id}-match-${index}`} style={control} value={selected} onChange={(event) => set({ type: 'matching', pairs: [...pairs.filter((pair) => pair.leftId !== left.id), ...(event.target.value ? [{ leftId: left.id, rightId: event.target.value }] : [])] })}>
        <option value="">{t('longreadExercises.choose')}</option>{definition.right.map((right) => <option key={right.id} value={right.id} disabled={right.id !== selected && pairs.some((pair) => pair.rightId === right.id)}>{right.text}</option>)}
      </select></div>;
    })}</div>}
    {definition?.type === 'ordering' && <div style={{ display: 'grid', gap: 12 }}>{definition.items.map((_, index) => {
      const selected = response?.type === 'ordering' ? response.itemIds : [], value = selected[index] ?? '';
      return <div key={index}><label htmlFor={`${id}-position-${index}`}>{t('longreadExercises.position', { number: index + 1 })}</label><select id={`${id}-position-${index}`} style={control} value={value} onChange={(event) => { const next = Array.from({ length: definition.items.length }, (_, position) => selected[position] ?? ''); next[index] = event.target.value; set({ type: 'ordering', itemIds: next }); }}>
        <option value="">{t('longreadExercises.choose')}</option>{definition.items.map((item) => <option key={item.id} value={item.id} disabled={item.id !== value && selected.includes(item.id)}>{item.text}</option>)}
      </select></div>;
    })}</div>}
    {definition?.type === 'fill_blank' && <div style={{ display: 'grid', gap: 12 }}>{definition.blanks.map((blank, index) => <div key={blank.id}>
      <label htmlFor={`${id}-blank-${index}`}>{t('longreadExercises.blank', { id: index + 1 })} · <bdi>{blank.id}</bdi></label>
      <input id={`${id}-blank-${index}`} style={control} maxLength={4000} value={response?.type === 'fill_blank' ? response.blanks.find((value) => value.blankId === blank.id)?.value ?? '' : ''} onChange={(event) => set({ type: 'fill_blank', blanks: definition.blanks.map((item) => ({ blankId: item.id, value: item.id === blank.id ? event.target.value : response?.type === 'fill_blank' ? response.blanks.find((value) => value.blankId === item.id)?.value ?? '' : '' })) })} />
    </div>)}</div>}
    {definition?.type === 'short_answer' && <><label htmlFor={`${id}-text`}>{t('longreadExercises.shortAnswer')}</label><textarea id={`${id}-text`} style={{ ...control, minHeight: 100 }} maxLength={4000} value={response?.type === 'short_answer' ? response.text : ''} onChange={(event) => set({ type: 'short_answer', text: event.target.value })} /></>}
    {(definition?.type === 'short_answer' || definition?.type === 'fill_blank') && <p>{t(definition.caseSensitive ? 'longreadExercises.caseSensitive' : 'longreadExercises.caseInsensitive')} · {t(`longreadExercises.whitespaceModes.${definition.whitespace}`)}</p>}
  </fieldset>;
}
