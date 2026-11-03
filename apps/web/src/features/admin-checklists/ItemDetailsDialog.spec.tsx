// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistItemSummary } from '../../shared/api/types.js';
import { ItemDetailsDialog, noteAnswerOptions } from './ItemDetailsDialog.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  close(this: HTMLDialogElement) { this.removeAttribute('open'); },
});
const t = ((key: string, fallback?: string | Record<string, unknown>) => (typeof fallback === 'string' ? fallback : key)) as unknown as TFunction;
const item: ChecklistItemSummary = { id: 'i1', checklistId: 'c1', order: 1, text: 'Витрина выставлена', points: 10, isRequired: true, photoRequired: false };
const options = noteAnswerOptions([{ value: 1, label: 'Нет' }, { value: 2, label: 'Да' }], t);

function mount(onSave = vi.fn(async () => undefined), extra: Partial<ChecklistItemSummary> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => createRoot(host).render(<ItemDetailsDialog item={{ ...item, ...extra }} onClose={() => undefined} onSave={onSave} open options={options} t={t} />));
  return { onSave };
}
const click = (element: Element) => act(() => { (element as HTMLElement).click(); });
const select = (value: string) => act(() => {
  const field = document.querySelector('select')!;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('change', { bubbles: true }));
});
const saveButton = () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Save')!;

describe('ItemDetailsDialog (PR 415)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('turns the description on, saves it trimmed and leaves the explanation rule off', async () => {
    const { onSave } = mount();
    expect(document.querySelector('textarea')).toBeNull();
    click(document.querySelector('input[role="switch"]')!);
    const area = document.querySelector('textarea')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, '  Ценники совпадают  ');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { saveButton().click(); });
    expect(onSave).toHaveBeenCalledWith({ descriptionEnabled: true, description: 'Ценники совпадают', noteRule: 'off', noteAnswers: null, noteRequired: false });
  });

  it('"for chosen answers" needs an answer, then saves the answers and the required flag', async () => {
    const { onSave } = mount();
    select('on_answers');
    expect(saveButton().disabled).toBe(true);
    expect(document.body.textContent).toContain('Choose at least one answer.');
    const boxes = [...document.querySelectorAll<HTMLInputElement>('fieldset input[type="checkbox"]')];
    expect(boxes.map((box) => box.parentElement!.textContent!.trim())).toEqual(['Нет', 'Да']);
    click(boxes[0]!);
    click([...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((box) => box.parentElement!.textContent!.includes('required'))!);
    expect(saveButton().disabled).toBe(false);
    await act(async () => { saveButton().click(); });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ noteRule: 'on_answers', noteAnswers: ['1'], noteRequired: true }));
  });

  it('shows the server refusal and keeps the dialog open', async () => {
    const { onSave } = mount(vi.fn(async () => { throw new Error('Choose at least one answer that opens the explanation'); }));
    await act(async () => { saveButton().click(); });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Choose at least one answer that opens the explanation');
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('a plain tick box offers the single answer "Not ticked"', () => {
    expect(noteAnswerOptions(null, t)).toEqual([{ value: 'unchecked', label: 'Not ticked' }]);
  });
});
