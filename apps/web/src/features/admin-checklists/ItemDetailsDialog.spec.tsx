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

function mount(onSave = vi.fn(async () => undefined), extra: Partial<ChecklistItemSummary> = {}, apply?: { applyCount: number; onApplyAll: (patch: unknown) => Promise<number> }) {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => createRoot(host).render(<ItemDetailsDialog item={{ ...item, ...extra }} onClose={() => undefined} onSave={onSave} open options={options} t={t} {...(apply ? { applyCount: apply.applyCount, onApplyAll: apply.onApplyAll as never } : {})} />));
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
    const area = document.querySelector('[contenteditable="true"]')!;
    await act(async () => {
      area.innerHTML = '<p>  Ценники совпадают  </p>';
      await new Promise((resolve) => setTimeout(resolve, 0));
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
  it('PR 443: boxes keep their own size and sit level with the first line of their caption', () => {
    mount(undefined, { noteRule: 'on_answers' } as Partial<ChecklistItemSummary>);
    const boxes = [...document.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThan(1);
    for (const box of boxes.filter((entry) => entry.getAttribute('role') !== 'switch')) {
      expect(box.style.width).toBe('18px');
      expect(box.style.flexGrow === '' || box.style.flexShrink === '0' || box.style.flex === '0 0 auto').toBe(true);
      expect(box.closest('label')?.style.alignItems).toBe('flex-start');
    }
    expect(document.querySelector('input[role="switch"]')?.className).toContain('admin-switch');
  });
  it('PR 457: "Apply to all" asks first, then saves the criterion and copies its rule to the others of the scale', async () => {
    const onApplyAll = vi.fn(async () => 3);
    mount(vi.fn(async () => undefined), { scaleId: 's1' }, { applyCount: 3, onApplyAll });
    select('on_answers');
    click(document.querySelectorAll<HTMLInputElement>('fieldset input[type="checkbox"]')[0]!);
    const apply = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Apply to all criteria of the sheet with this scale')!;
    click(apply);
    expect(onApplyAll).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Criteria with this scale:');
    const confirm = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Apply')!;
    await act(async () => { confirm.click(); });
    expect(onApplyAll).toHaveBeenCalledWith(expect.objectContaining({ noteRule: 'on_answers', noteAnswers: ['1'] }));
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Criteria changed:');
  });

  it('PR 457: no "Apply to all" button when no other criterion uses the scale', () => {
    mount(vi.fn(async () => undefined), { scaleId: 's1' }, { applyCount: 0, onApplyAll: vi.fn(async () => 0) });
    expect([...document.querySelectorAll('button')].some((button) => button.textContent?.startsWith('Apply to all'))).toBe(false);
  });
});
