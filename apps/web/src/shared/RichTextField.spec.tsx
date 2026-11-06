// @vitest-environment jsdom
import '../i18n/index.js';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { RichTextField } from './RichTextField.js';
import { RichText } from './RichText.js';

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
