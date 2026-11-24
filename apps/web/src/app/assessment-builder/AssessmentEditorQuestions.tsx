import { questionTypeSchema, scoringModeSchema, type QuestionType } from '@lms/shared/assessment-question-types';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../shared/adminPage.js';
import { Badge, Button } from '../../shared/ui.js';
import { QuestionDefinitionFields } from '../../features/longread-exercises/QuestionAuthorFields.js';
import { emptyQuestionDefinition } from '../../features/longread-exercises/question-author-model.js';
import { RichTextField } from '../../shared/RichTextField.js';
import { copyEditorQuestion, moveEditorItem, newEditorQuestion, type EditorQuestion } from './editorModel.js';

const optionLabels = { single_choice: 'singleChoice', multiple_choice: 'multipleChoice', true_false: 'trueFalse' } as const;
const scoringLabels = {
  all_or_nothing: 'allOrNothing',
  proportional: 'partialScoring',
  proportional_with_penalty: 'penaltyScoring',
  per_option: 'perOptionScoring',
} as const;

function ReorderList<T extends { id: string }>({ items, onChange, children }: {
  items: T[];
  onChange: (items: T[]) => void;
  children: (item: T, index: number, reorder: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation();
  const dragType = 'application/x-lms-assessment-item';
  return <ol className="assessment-editor-list">
    {items.map((item, index) => <li key={item.id}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(dragType)) event.preventDefault();
      }}
      onDrop={(event) => {
        const id = event.dataTransfer.getData(dragType);
        if (!items.some((candidate) => candidate.id === id)) return;
        event.preventDefault();
        event.stopPropagation();
        onChange(moveEditorItem(items, id, index));
      }}>
      {children(item, index, <>
        <span draggable aria-hidden="true" className="assessment-editor-grip"
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(dragType, item.id);
          }}>⠿</span>
        <Button type="button" size="sm" variant="secondary" aria-label={t('admin.assessmentBuilder.editor.moveUp', { number: index + 1 })}
          disabled={index === 0} onClick={() => onChange(moveEditorItem(items, item.id, index - 1))}>↑</Button>
        <Button type="button" size="sm" variant="secondary" aria-label={t('admin.assessmentBuilder.editor.moveDown', { number: index + 1 })}
          disabled={index === items.length - 1} onClick={() => onChange(moveEditorItem(items, item.id, index + 1))}>↓</Button>
      </>)}
    </li>)}
  </ol>;
}

export function AssessmentEditorQuestions({ questions, onChange, onPreview, single, onEditBank, onDetachBank }: {
  questions: EditorQuestion[];
  onChange: (questions: EditorQuestion[]) => void;
  onPreview: (index: number) => void;
  single?: boolean;
  onEditBank?: (id: string) => void;
  onDetachBank?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  function changeQuestion(id: string, patch: Partial<EditorQuestion>) {
    onChange(questions.map((question) => question.id === id ? { ...question, ...patch } : question));
  }
  function addQuestion(type: QuestionType) {
    const question = { ...newEditorQuestion(), type, definition: emptyQuestionDefinition(type) };
    onChange([...questions, question]);
    setExpanded(question.id);
  }
  return <div className="edit-layout" data-testid="assessment-editor-questions">
    <ReorderList items={questions} onChange={onChange}>
      {(question, index, reorder) => <div className="admin-form">
        <div className="assessment-editor-row">
          <div className="admin-header-actions">
            {reorder}
            <div>
              <small>{index + 1} · {t('admin.assessmentBuilder.points')} {question.points}</small>
              <div>{question.bankEntryId && <span>↗ {t('questionBank.linked')} </span>}<strong>{question.title || t('admin.assessmentBuilder.questionTitle')}</strong></div>
            </div>
          </div>
          <div className="admin-header-actions">
            <Button type="button" variant="secondary" size="sm"
              aria-expanded={expanded === question.id} onClick={() => question.bankEntryId ? onEditBank?.(question.bankEntryId) : setExpanded(expanded === question.id ? null : question.id)}>
              {t('admin.assessmentBuilder.edit')}
            </Button>
            {question.bankEntryId && <Button type="button" variant="secondary" size="sm"
              disabled={!onDetachBank} onClick={() => onDetachBank?.(question.id)}>{t('questionBank.detach')}</Button>}
            {!single && <><Button type="button" variant="secondary" size="sm" aria-label={t('admin.assessmentBuilder.editor.copyQuestion')}
              onClick={() => onChange([...questions.slice(0, index + 1), copyEditorQuestion(question), ...questions.slice(index + 1)])}>
              {t('admin.checklists.copy')}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => onPreview(index)}>{t('admin.assessmentBuilder.editor.fromQuestion')}</Button>
            <Button type="button" variant="danger" size="sm" aria-label={t('admin.assessmentBuilder.editor.deleteQuestion')}
              onClick={() => onChange(questions.filter((item) => item.id !== question.id))}>
              {t('admin.assessmentBuilder.delete')}
            </Button></>}
          </div>
        </div>
        {(single || expanded === question.id) && !question.bankEntryId && <>
        <FormField id={question.id} label={t('longreadExercises.title')} required>
          <input id={question.id} maxLength={200} value={question.title}
            onChange={(event) => changeQuestion(question.id, { title: event.target.value })} />
        </FormField>
        <FormField id={`${question.id}-type`} label={t('admin.assessmentBuilder.questionType')}>
          <select id={`${question.id}-type`} value={question.type} onChange={(event) => {
            const type = questionTypeSchema.parse(event.target.value);
            const definition = emptyQuestionDefinition(type);
            changeQuestion(question.id, { type, definition, options: definition ? [] : question.options });
          }}>
            {questionTypeSchema.options.map((type) =>
              <option key={type} value={type}>{t(`longreadExercises.types.${type}`)}</option>)}
          </select>
        </FormField>
        <RichTextField id={`${question.id}-text`} label={t('longreadExercises.text')} value={question.text ?? ''}
          maxLength={4000} onChange={(text) => changeQuestion(question.id, { text: text || null })} />
        <FormField id={`${question.id}-image`} label={t('admin.assessmentBuilder.editor.questionImage')}>
          <input id={`${question.id}-image`} maxLength={2000} value={question.imageUrl ?? ''}
            onChange={(event) => changeQuestion(question.id, { imageUrl: event.target.value || null })} />
        </FormField>
        <FormField id={`${question.id}-scoring`} label={t('longreadExercises.scoringMode')}>
          <select id={`${question.id}-scoring`} value={question.scoringMode} onChange={(event) =>
            changeQuestion(question.id, { scoringMode: scoringModeSchema.parse(event.target.value) })}>
            {scoringModeSchema.options.map((mode) => <option key={mode} value={mode}>{t(`longreadExercises.${scoringLabels[mode]}`)}</option>)}
          </select>
        </FormField>
        <FormField id={`${question.id}-points`} label={t('admin.assessmentBuilder.points')}>
          <input id={`${question.id}-points`} type="number" min={1} value={question.points || ''}
            onChange={(event) => changeQuestion(question.id, { points: Number(event.target.value) })} />
        </FormField>
        {(['correctFeedback', 'incorrectFeedback'] as const).map((field) => <RichTextField key={field}
          id={`${question.id}-${field}`} label={t(`assessments.policy.${field}`)}
          value={question[field] ?? ''} maxLength={2000} onChange={(value) => changeQuestion(question.id, { [field]: value || null })} />)}
        {question.definition ? <QuestionDefinitionFields definition={question.definition}
          onChange={(definition) => changeQuestion(question.id, { definition })} /> : <>
          <ReorderList items={question.options} onChange={(options) => changeQuestion(question.id, { options })}>
            {(option, optionIndex, reorderOption) => <div className="admin-form">
              <div className="admin-header-actions">{reorderOption}<Badge variant="neutral">{optionIndex + 1}</Badge></div>
              <FormField id={option.id} label={t('admin.assessmentBuilder.optionText')}>
                <input id={option.id} maxLength={2000} value={option.text ?? ''} onChange={(event) =>
                  changeQuestion(question.id, { options: question.options.map((item) =>
                    item.id === option.id ? { ...item, text: event.target.value || null } : item) })} />
              </FormField>
              <FormField id={`${option.id}-image`} label={t('admin.assessmentBuilder.editor.optionImage')}>
                <input id={`${option.id}-image`} maxLength={2000} value={option.imageUrl ?? ''} onChange={(event) =>
                  changeQuestion(question.id, { options: question.options.map((item) =>
                    item.id === option.id ? { ...item, imageUrl: event.target.value || null } : item) })} />
              </FormField>
              {option.imageUrl && <img className="admin-preview__option-image" src={option.imageUrl} alt={option.text ?? ''} />}
              <label className="admin-checkbox-field">
                <input type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'} name={`correct-${question.id}`}
                  checked={option.isCorrect} onChange={(event) => changeQuestion(question.id, {
                    options: question.options.map((item) => item.id === option.id
                      ? { ...item, isCorrect: event.target.checked }
                      : question.type === 'multiple_choice' ? item : { ...item, isCorrect: false }),
                  })} />
                {t('admin.assessmentBuilder.correct')}
              </label>
              <Button type="button" size="sm" onClick={() => changeQuestion(question.id, {
                options: question.options.filter((item) => item.id !== option.id),
              })}>{t('admin.assessmentBuilder.editor.deleteOption')}</Button>
            </div>}
          </ReorderList>
          <Button type="button" onClick={() => changeQuestion(question.id, {
            options: [...question.options, { id: crypto.randomUUID(), text: null, imageUrl: null, isCorrect: false }],
          })}>{t('admin.assessmentBuilder.addOption')}</Button>
        </>}
        </>}
      </div>}
    </ReorderList>
    {!single && <section className="admin-card admin-form">
      <h2>{t('admin.assessmentBuilder.addQuestionBtn')}</h2>
      {questionTypeSchema.options.map((type) =>
        <Button key={type} type="button" variant="secondary" onClick={() => addQuestion(type)}>
          + {t(type in optionLabels ? `admin.assessmentBuilder.${optionLabels[type as keyof typeof optionLabels]}` : `longreadExercises.types.${type}`)}
        </Button>)}
    </section>}
  </div>;
}
