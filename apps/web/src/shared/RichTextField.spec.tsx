// @vitest-environment jsdom
import '../i18n/index.js';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { RichTextField } from './RichTextField.js';
import { RichText } from './RichText.js';
import { descriptionHtml } from '@lms/shared/checklist-description';

let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; });
it('counts visible characters, retains allowed emphasis and rejects excess input', async () => {
  const onChange = vi.fn();
  function Form() { const [value, setValue] = useState('Old'); return <RichTextField label="Name" value={value} maxLength={3} singleLine onChange={(value) => { setValue(value); onChange(value); }} />; }
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(<Form />); });
  const editor = (host.querySelector('[role="textbox"]') as HTMLElement & { editor: Editor }).editor;
  act(() => { editor.commands.setContent('<strong>New</strong>'); });
  expect(onChange).toHaveBeenLastCalledWith('<p><strong>New</strong></p>');
  act(() => { editor.commands.setContent('<strong>Longer</strong>'); });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[role="textbox"]')?.textContent).toBe('New');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it('exposes a plain accessible label and makes a read-only field non-editable', async () => {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(<RichTextField label="<strong>Label</strong>" value="Text" onChange={vi.fn()} disabled singleLine />); });
  const field = host.querySelector('[role="textbox"]')!;
  expect(field.getAttribute('contenteditable')).toBe('false');
  expect(field.getAttribute('aria-multiline')).toBe('false');
  expect(document.getElementById(field.getAttribute('aria-labelledby')!)?.textContent).toBe('Label');
});
it('renders a real heading with safe spans and preserves legacy plain strings', () => {
  const host = document.createElement('div'); root = createRoot(host);
  act(() => root.render(<RichText as="h2" value={'<strong>Title</strong><script>bad()</script>'} />));
  expect(host.querySelector('h2')?.textContent).toBe('Title');
  expect(host.querySelector('script')).toBeNull();
  act(() => root.render(<RichText value="A < B & C" />));
  expect(host.textContent).toBe('A < B & C');
});
it('keeps the field alignment when the text changes and does not let pasted HTML change it', async () => {
  const onChange = vi.fn();
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(<RichTextField label="Text" value={'<p style="text-align:center">Центр</p>'} onChange={onChange} />); });
  const field = host.querySelector('[role="textbox"]') as HTMLElement & { editor: Editor };
  expect(field.querySelector('p')?.style.textAlign).toBe('center');
  act(() => { field.editor.commands.focus('end'); field.editor.commands.insertContent('!'); });
  expect(onChange).toHaveBeenLastCalledWith('<p style="text-align:center">Центр!</p>');
  act(() => { field.editor.commands.insertContent(descriptionHtml('<p style="text-align:right">Вставка</p>', { align: false })); });
  expect(onChange).toHaveBeenLastCalledWith('<p style="text-align:center">Центр!<br>Вставка</p>');
});
it('stores the alignment chosen by the keyboard shortcut and writes nothing for the default', async () => {
  const onChange = vi.fn();
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  function Form() { const [value, setValue] = useState('Plain'); return <RichTextField label="Text" value={value} onChange={(next) => { setValue(next); onChange(next); }} />; }
  await act(async () => { root.render(<Form />); });
  const field = host.querySelector('[role="textbox"]') as HTMLElement & { editor: Editor };
  act(() => { field.editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); });
  expect(onChange).toHaveBeenLastCalledWith('<p style="text-align:center">Plain</p>');
  act(() => { field.editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', code: 'KeyL', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); });
  expect(onChange).toHaveBeenLastCalledWith('Plain');
});
it('shows the alignment in read-only text, also for inline spans, and leaves old texts untouched', () => {
  const host = document.createElement('div'); root = createRoot(host);
  act(() => root.render(<RichText as="p" value={'<p style="text-align:right">Право</p>'} />));
  expect(host.querySelector('p')?.style.textAlign).toBe('right');
  act(() => root.render(<RichText value={'<p style="text-align:justify">Ширина</p>'} />));
  expect(host.querySelector('span')?.style.textAlign).toBe('justify');
  expect(host.querySelector('span')?.style.display).toBe('block');
  act(() => root.render(<RichText value={'<strong>Старый</strong>'} />));
  expect(host.querySelector('span')?.style.textAlign).toBe('');
});
