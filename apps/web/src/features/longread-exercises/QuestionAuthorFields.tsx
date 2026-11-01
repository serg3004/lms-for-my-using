import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuestionDefinition } from '@lms/shared/assessment-question-types';
import type { WriteLongreadQuestion } from '@lms/shared/longread-exercises';
const variants = (text: string) => text.split('\n');
export function QuestionAuthorFields({ value, onChange }: { value: WriteLongreadQuestion; onChange: (value: WriteLongreadQuestion) => void }) {
  const { t } = useTranslation(), id = useId(), d = value.definition;
  const patch = (definition: QuestionDefinition) => onChange({ ...value, definition });
  const text = (name: string, val: string, change: (text: string) => void, multiline = false) => <label style={{ display: 'block', marginBlock: 12 }}>{t(`longreadExercises.${name}`)}{multiline ? <textarea style={{ width: '100%', minHeight: 88 }} maxLength={20_000} value={val} onChange={(e) => change(e.target.value)} /> : <input style={{ width: '100%', minHeight: 44 }} maxLength={2000} value={val} onChange={(e) => change(e.target.value)} />}</label>;
  if (!d) return <>
    {value.options.map((option, index) => <div key={option.id ?? index} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {text('option', option.text, (label) => onChange({ ...value, options: value.options.map((o, i) => i === index ? { ...o, text: label } : o) }))}
      <label><input type={value.type === 'multiple_choice' ? 'checkbox' : 'radio'} name={`${id}-correct`} checked={option.isCorrect} onChange={(e) => onChange({ ...value, options: value.options.map((o, i) => ({ ...o, isCorrect: i === index ? e.target.checked : value.type === 'multiple_choice' && o.isCorrect })) })} /> {t('longreadExercises.correctOption')}</label>
      <button type="button" className="admin-btn admin-btn--secondary" disabled={value.options.length <= 2} onClick={() => onChange({ ...value, options: value.options.filter((_, i) => i !== index) })}>{t('longread.delete')}</button>
    </div>)}
    <button type="button" className="admin-btn admin-btn--secondary" disabled={value.options.length >= 50} onClick={() => onChange({ ...value, options: [...value.options, { text: '', isCorrect: false }] })}>{t('longreadExercises.addOption')}</button>
  </>;
  return <>
    {d.type === 'true_false' && <label>{t('longreadExercises.correctAnswer')}<select value={String(d.correctAnswer)} onChange={(e) => patch({ ...d, correctAnswer: e.target.value === 'true' })}><option value="true">{t('longreadExercises.true')}</option><option value="false">{t('longreadExercises.false')}</option></select></label>}
    {d.type === 'matching' && <>
      <p>{t('longreadExercises.matchingHelp')}</p>
      {d.left.map((left, i) => <div key={left.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {text('leftItem', left.text, (value) => patch({ ...d, left: d.left.map((v, n) => n === i ? { ...v, text: value } : v) }))}
        {text('rightItem', d.right[i]!.text, (value) => patch({ ...d, right: d.right.map((v, n) => n === i ? { ...v, text: value } : v) }))}
        <button type="button" className="admin-btn admin-btn--secondary" disabled={d.left.length <= 2} onClick={() => patch({ ...d, left: d.left.filter((_, n) => n !== i), right: d.right.filter((_, n) => n !== i), correctPairs: d.correctPairs.filter((p) => p.leftId !== left.id) })}>{t('longread.delete')}</button>
      </div>)}
      <button type="button" className="admin-btn admin-btn--secondary" disabled={d.left.length >= 50} onClick={() => { const leftId = crypto.randomUUID(), rightId = crypto.randomUUID(); patch({ ...d, left: [...d.left, { id: leftId, text: '' }], right: [...d.right, { id: rightId, text: '' }], correctPairs: [...d.correctPairs, { leftId, rightId }] }); }}>{t('longreadExercises.addPair')}</button>
    </>}
    {d.type === 'ordering' && <>
      <p>{t('longreadExercises.orderingHelp')}</p>
      {d.correctOrder.map((itemId, index) => <div key={itemId} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {text('item', d.items.find((v) => v.id === itemId)!.text, (value) => patch({ ...d, items: d.items.map((v) => v.id === itemId ? { ...v, text: value } : v) }))}
        <button type="button" className="admin-btn admin-btn--secondary" disabled={index === 0} onClick={() => { const order = [...d.correctOrder]; [order[index - 1], order[index]] = [order[index]!, order[index - 1]!]; patch({ ...d, correctOrder: order }); }}>{t('longread.up')}</button>
        <button type="button" className="admin-btn admin-btn--secondary" disabled={d.items.length <= 2} onClick={() => patch({ ...d, items: d.items.filter((v) => v.id !== itemId), correctOrder: d.correctOrder.filter((v) => v !== itemId) })}>{t('longread.delete')}</button>
      </div>)}
      <button type="button" className="admin-btn admin-btn--secondary" disabled={d.items.length >= 50} onClick={() => { const item = { id: crypto.randomUUID(), text: '' }; patch({ ...d, items: [...d.items, item], correctOrder: [...d.correctOrder, item.id] }); }}>{t('longreadExercises.addItem')}</button>
    </>}
    {d.type === 'fill_blank' && <>
      <p>{t('longreadExercises.blankHelp')}</p>
      {d.blanks.map((blank, index) => <div key={index}>
        {text('blankId', blank.id, (value) => patch({ ...d, blanks: d.blanks.map((v, n) => n === index ? { ...v, id: value } : v) }))}
        {text('acceptedAnswers', blank.acceptedAnswers.join('\n'), (value) => patch({ ...d, blanks: d.blanks.map((v, n) => n === index ? { ...v, acceptedAnswers: variants(value) } : v) }), true)}
        <button type="button" className="admin-btn admin-btn--secondary" disabled={d.blanks.length <= 1} onClick={() => patch({ ...d, blanks: d.blanks.filter((_, n) => n !== index) })}>{t('longread.delete')}</button>
      </div>)}
      <button type="button" className="admin-btn admin-btn--secondary" disabled={d.blanks.length >= 50} onClick={() => patch({ ...d, blanks: [...d.blanks, { id: `blank-${crypto.randomUUID()}`, acceptedAnswers: [''] }] })}>{t('longreadExercises.addBlank')}</button>
    </>}
    {d.type === 'short_answer' && text('acceptedAnswers', d.acceptedAnswers.join('\n'), (value) => patch({ ...d, acceptedAnswers: variants(value) }), true)}
    {(d.type === 'short_answer' || d.type === 'fill_blank') && <>
      <p>{t('longreadExercises.variantsHelp')}</p>
      <label><input type="checkbox" checked={d.caseSensitive} onChange={(e) => patch({ ...d, caseSensitive: e.target.checked })} /> {t('longreadExercises.caseSensitive')}</label>
      <label style={{ display: 'block' }}>{t('longreadExercises.whitespace')}<select value={d.whitespace} onChange={(e) => patch({ ...d, whitespace: e.target.value as typeof d.whitespace })}>{['exact', 'trim', 'collapse'].map((mode) => <option key={mode} value={mode}>{t(`longreadExercises.whitespaceModes.${mode}`)}</option>)}</select></label>
    </>}
  </>;
}
