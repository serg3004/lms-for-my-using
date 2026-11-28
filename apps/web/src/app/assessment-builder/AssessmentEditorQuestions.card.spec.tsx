// @vitest-environment jsdom
import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AssessmentEditorQuestions } from './AssessmentEditorQuestions.js';
import { newEditorQuestion, type EditorQuestion } from './editorModel.js';

const render = (questions: EditorQuestion[]) => renderToStaticMarkup(
  <AssessmentEditorQuestions questions={questions} onChange={() => undefined} onPreview={() => undefined} />);

describe('assessment question card (PR 583)', () => {
  it('shows the question type with the points and marks manual grading and material', () => {
    const plain = { ...newEditorQuestion(), title: 'Plain', points: 2 };
    const manual = { ...newEditorQuestion(), title: 'Essay', type: 'short_answer' as const,
      definition: { type: 'short_answer', manualReview: true, acceptedAnswers: [], caseSensitive: false, whitespace: 'trim' } as EditorQuestion['definition'],
      imageUrl: 'https://example.test/a.png' };
    const html = render([plain, manual]);
    expect(html).toContain('Один вариант');
    expect(html).toContain('Короткий ответ');
    expect(html).toContain('проверяет человек');
    expect(html.match(/проверяет человек/g)).toHaveLength(1);
    expect(html.match(/материал/g)).toHaveLength(1);
  });
});
