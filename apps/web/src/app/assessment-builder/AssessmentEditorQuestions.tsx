import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../shared/adminPage.js';
import { Button } from '../../shared/ui.js';
import { supportsOptionQuestion } from '../assessment-taking/model.js';
import { copyEditorQuestion, moveEditorItem, newEditorQuestion, type EditorQuestion } from './editorModel.js';

function ReorderList<T extends { id: string }>({ items, onChange, children }: {
  items: T[];
  onChange: (items: T[]) => void;
  children: (item: T, index: number) => ReactNode;
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
      <div className="assessment-editor-actions">
        <span draggable aria-hidden="true" className="assessment-editor-grip"
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(dragType, item.id);
          }}>⠿</span>
        <Button type="button" size="sm" aria-label={t('admin.assessmentBuilder.editor.moveUp', { number: index + 1 })}
          disabled={index === 0} onClick={() => onChange(moveEditorItem(items, item.id, index - 1))}>↑</Button>
        <Button type="button" size="sm" aria-label={t('admin.assessmentBuilder.editor.moveDown', { number: index + 1 })}
          disabled={index === items.length - 1} onClick={() => onChange(moveEditorItem(items, item.id, index + 1))}>↓</Button>
      </div>
      {children(item, index)}
    </li>)}
  </ol>;
}

export function AssessmentEditorQuestions({ questions, onChange, onPreview }: {
  questions: EditorQuestion[];
  onChange: (questions: EditorQuestion[]) => void;
  onPreview: (index: number) => void;
}) {
  const { t } = useTranslation();
  function changeQuestion(id: string, patch: Partial<EditorQuestion>) {
    onChange(questions.map((question) => question.id === id ? { ...question, ...patch } : question));
  }
  return <>
    <ReorderList items={questions} onChange={onChange}>
      {(question, index) => <div className="admin-form">
        {!supportsOptionQuestion(question) && <p role="status">{t('assessments.typedQuestionUnavailable')}</p>}
        <FormField id={question.id} label={t('admin.assessmentBuilder.questionTitle')} required>
          <input id={question.id} maxLength={200} value={question.title} disabled={!supportsOptionQuestion(question)}
            onChange={(event) => changeQuestion(question.id, { title: event.target.value })} />
        </FormField>
        {supportsOptionQuestion(question) && <FormField id={`${question.id}-type`} label={t('admin.assessmentBuilder.questionType')}>
          <select id={`${question.id}-type`} value={question.type} onChange={(event) =>
            changeQuestion(question.id, { type: event.target.value as EditorQuestion['type'] })}>
            {(['single_choice', 'multiple_choice', 'true_false'] as const).map((type) =>
              <option key={type} value={type}>{t(`admin.assessmentBuilder.${{ single_choice: 'singleChoice', multiple_choice: 'multipleChoice', true_false: 'trueFalse' }[type]}`)}</option>)}
          </select>
        </FormField>}
        <FormField id={`${question.id}-points`} label={t('admin.assessmentBuilder.points')}>
          <input id={`${question.id}-points`} type="number" min={1} disabled={!supportsOptionQuestion(question)} value={question.points || ''}
            onChange={(event) => changeQuestion(question.id, { points: Number(event.target.value) })} />
        </FormField>
        {supportsOptionQuestion(question) && <>
          <ReorderList items={question.options} onChange={(options) => changeQuestion(question.id, { options })}>
            {(option) => <div className="admin-form">
              <FormField id={option.id} label={t('admin.assessmentBuilder.optionText')}>
                <input id={option.id} maxLength={2000} value={option.text ?? ''} onChange={(event) =>
                  changeQuestion(question.id, { options: question.options.map((item) =>
                    item.id === option.id ? { ...item, text: event.target.value || null } : item) })} />
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
        <div className="assessment-editor-actions">
          <Button type="button" onClick={() => onChange([...questions.slice(0, index + 1), copyEditorQuestion(question), ...questions.slice(index + 1)])}>
            {t('admin.assessmentBuilder.editor.copyQuestion')}
          </Button>
          <Button type="button" onClick={() => onPreview(index)}>{t('admin.assessmentBuilder.editor.fromQuestion')}</Button>
          <Button type="button" onClick={() => onChange(questions.filter((item) => item.id !== question.id))}>
            {t('admin.assessmentBuilder.editor.deleteQuestion')}
          </Button>
        </div>
      </div>}
    </ReorderList>
    <Button type="button" onClick={() => onChange([...questions, newEditorQuestion()])}>{t('admin.assessmentBuilder.addQuestionBtn')}</Button>
  </>;
}
