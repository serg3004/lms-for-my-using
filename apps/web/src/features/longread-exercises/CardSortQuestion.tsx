import { useTranslation } from 'react-i18next';
import type { QuestionDefinition, PublicQuestionDefinition, QuestionResponse } from '@lms/shared/assessment-question-types';

import { AssessmentMaterialField, AssessmentPicture } from '../assessment-materials/AssessmentMaterial.js';

type CardSort = Extract<QuestionDefinition, { type: 'card_sort' }>;
type PublicCardSort = Extract<PublicQuestionDefinition, { type: 'card_sort' }>;
type Card = PublicCardSort['cards'][number];

export function CardSortAuthor({ definition: d, onChange: patch }: { definition: CardSort; onChange: (definition: QuestionDefinition) => void }) {
  const { t } = useTranslation();
  const categoryOf = (cardId: string) => d.correctPlacements.find((placement) => placement.cardId === cardId)?.categoryId ?? d.categories[0]!.id;
  const setCard = (id: string, change: Partial<Card>) => patch({ ...d, cards: d.cards.map((card) => {
    if (card.id !== id) return card;
    const next = { ...card, ...change };
    if (next.image === undefined) delete next.image;
    return next;
  }) });
  return <>
    <p>{t('longreadExercises.sortHelp')}</p>
    {d.categories.map((category, index) => <div key={category.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
      <label style={{ display: 'block', minWidth: 0, flex: '1 1 220px' }}>{t('longreadExercises.category')} {index + 1}
        <input style={{ width: '100%', minHeight: 44 }} maxLength={2000} value={category.text}
          onChange={(event) => patch({ ...d, categories: d.categories.map((item) => item.id === category.id ? { ...item, text: event.target.value } : item) })} />
      </label>
      <button type="button" className="admin-btn admin-btn--secondary" disabled={d.categories.length <= 2} onClick={() => {
        const rest = d.categories.filter((item) => item.id !== category.id);
        patch({ ...d, categories: rest, correctPlacements: d.correctPlacements.map((placement) => placement.categoryId === category.id ? { ...placement, categoryId: rest[0]!.id } : placement) });
      }}>{t('longread.delete')}</button>
    </div>)}
    <button type="button" className="admin-btn admin-btn--secondary" disabled={d.categories.length >= 4}
      onClick={() => patch({ ...d, categories: [...d.categories, { id: crypto.randomUUID(), text: '' }] })}>{t('longreadExercises.addCategory')}</button>
    {d.cards.map((card, index) => <fieldset key={card.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, minWidth: 0, margin: '8px 0' }}>
      <legend>{t('longreadExercises.card')} {index + 1}</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
        <label style={{ display: 'block', minWidth: 0, flex: '1 1 220px' }}>{t('longreadExercises.card')} {index + 1}
          <input style={{ width: '100%', minHeight: 44 }} maxLength={2000} value={card.text} onChange={(event) => setCard(card.id, { text: event.target.value })} />
        </label>
        <label>{t('longreadExercises.cardCategory')}
          <select style={{ minHeight: 44, maxWidth: '100%' }} value={categoryOf(card.id)}
            onChange={(event) => patch({ ...d, correctPlacements: d.correctPlacements.map((placement) => placement.cardId === card.id ? { ...placement, categoryId: event.target.value } : placement) })}>
            {d.categories.map((category, position) => <option key={category.id} value={category.id}>{category.text || `${t('longreadExercises.category')} ${position + 1}`}</option>)}
          </select>
        </label>
        <button type="button" className="admin-btn admin-btn--secondary" disabled={d.cards.length <= 2}
          onClick={() => patch({ ...d, cards: d.cards.filter((item) => item.id !== card.id), correctPlacements: d.correctPlacements.filter((placement) => placement.cardId !== card.id) })}>{t('longread.delete')}</button>
      </div>
      <p>{t('longreadExercises.cardImage')}</p>
      <AssessmentMaterialField value={card.image ?? null} onChange={(material) => setCard(card.id, { image: material ?? undefined })} />
    </fieldset>)}
    <button type="button" className="admin-btn admin-btn--secondary" disabled={d.cards.length >= 50} onClick={() => {
      const card = { id: crypto.randomUUID(), text: '' };
      patch({ ...d, cards: [...d.cards, card], correctPlacements: [...d.correctPlacements, { cardId: card.id, categoryId: d.categories[0]!.id }] });
    }}>{t('longreadExercises.addCard')}</button>
  </>;
}

/** Sort cards by dragging them into a category or by choosing the category in the list of the card. */
export function CardSortResponse({ definition, response, onChange, id }: {
  definition: PublicCardSort; response?: QuestionResponse; onChange: (response: QuestionResponse) => void; id: string;
}) {
  const { t } = useTranslation();
  const placements = response?.type === 'card_sort' ? response.placements : [];
  const place = (cardId: string, categoryId: string) =>
    onChange({ type: 'card_sort', placements: [...placements.filter((placement) => placement.cardId !== cardId), ...(categoryId ? [{ cardId, categoryId }] : [])] });
  const categoryOf = (cardId: string) => placements.find((placement) => placement.cardId === cardId)?.categoryId ?? '';
  const renderCard = (card: Card, index: number) => <li key={card.id} draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', card.id)}
    style={{ listStyle: 'none', border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, display: 'grid', gap: 6, minWidth: 0, overflowWrap: 'anywhere' }}>
    {card.image && <AssessmentPicture value={card.image} alt={card.text} style={{ display: 'block', maxWidth: '100%', maxHeight: 120, height: 'auto' }} />}
    {card.text && <span>{card.text}</span>}
    <select id={`${id}-card-${index}`} style={{ minHeight: 44, width: '100%', maxWidth: '100%' }} value={categoryOf(card.id)}
      aria-label={t('longreadExercises.cardCategoryLabel', { card: card.text || `${t('longreadExercises.card')} ${index + 1}` })} onChange={(event) => place(card.id, event.target.value)}>
      <option value="">{t('longreadExercises.choose')}</option>
      {definition.categories.map((category) => <option key={category.id} value={category.id}>{category.text}</option>)}
    </select>
  </li>;
  const column = (key: string, title: string, categoryId: string) => <section key={key} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, minWidth: 0 }}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => { event.preventDefault(); const cardId = event.dataTransfer.getData('text/plain'); if (definition.cards.some((card) => card.id === cardId)) place(cardId, categoryId); }}>
    <h4 style={{ margin: '0 0 8px' }}>{title}</h4>
    <ul style={{ margin: 0, padding: 0, display: 'grid', gap: 8 }}>
      {definition.cards.map((card, index) => categoryOf(card.id) === categoryId ? renderCard(card, index) : null)}
    </ul>
  </section>;
  return <div style={{ display: 'grid', gap: 12 }}>
    <p>{t('longreadExercises.sortPlay')}</p>
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
      {column('pool', t('longreadExercises.unsorted'), '')}
      {definition.categories.map((category) => column(category.id, category.text, category.id))}
    </div>
    <button type="button" className="admin-btn admin-btn--secondary" style={{ justifySelf: 'start' }} disabled={placements.length === 0}
      onClick={() => onChange({ type: 'card_sort', placements: [] })}>{t('longreadExercises.resetPlacements')}</button>
  </div>;
}
