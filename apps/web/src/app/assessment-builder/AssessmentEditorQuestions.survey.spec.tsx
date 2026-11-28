// @vitest-environment jsdom
import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AssessmentEditorQuestions } from './AssessmentEditorQuestions.js';
import { newEditorQuestion, type EditorQuestion } from './editorModel.js';

const render = (questions: EditorQuestion[], survey: boolean) => renderToStaticMarkup(
  <AssessmentEditorQuestions survey={survey} questions={questions} onChange={() => undefined} onPreview={() => undefined} />);

describe('survey questions in the editor (PR 540)', () => {
  const choice = { ...newEditorQuestion(), title: 'I like my work' };
  const comment = { ...newEditorQuestion(), title: 'Comment', type: 'short_answer' as const,
    definition: { type: 'short_answer', manualReview: true, acceptedAnswers: [], caseSensitive: false, whitespace: 'trim' } as EditorQuestion['definition'] };

  it('offers only choice and text questions and the agreement scale, with no points', () => {
    const html = render([choice, comment], true);
    expect(html).toContain('Шкала согласия (1–5)');
    expect(html).toContain('Свободный ответ');
    expect(html).not.toContain('Соответствие');
    expect(html).not.toContain('Порядок');
    expect(html).not.toContain('Баллы');
    expect(html).not.toContain('проверяет человек');
  });

  it('keeps every question type, points and the scale-less add list for a test', () => {
    const html = render([choice], false);
    expect(html).toContain('Соответствие');
    expect(html).toContain('Баллы');
    expect(html).not.toContain('Шкала согласия');
  });
});
