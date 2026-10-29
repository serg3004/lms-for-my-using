// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

const api = vi.hoisted(() => ({ listChecklistTemplates: vi.fn(), createChecklistFromTemplate: vi.fn(), listChecklistOrgTemplates: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('../../shared/api/checklists.js', () => api);

import { ChecklistTemplateDialog } from './ChecklistTemplateDialog';

Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  close(this: HTMLDialogElement) { this.removeAttribute('open'); },
});

const templates = [
  { key: 'consultant-assessment', title: 'Оценка консультанта', description: 'Описание', groupCount: 4, itemCount: 12 },
  { key: 'shift-opening', title: 'Открытие смены', description: 'Описание', groupCount: 3, itemCount: 8 },
];

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  vi.clearAllMocks();
});

async function mount(onCreated = vi.fn()) {
  api.listChecklistTemplates.mockResolvedValue({ items: templates });
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<ChecklistTemplateDialog open locale="ru" onClose={() => {}} onCreated={onCreated} t={i18n.t.bind(i18n)} />);
  });
  return { container, onCreated };
}

describe('ChecklistTemplateDialog (PR 341)', () => {
  it('lists the templates for the interface language', async () => {
    const { container } = await mount();
    expect(api.listChecklistTemplates).toHaveBeenCalledWith('ru');
    expect(container.textContent).toContain('Оценка консультанта');
    expect(container.textContent).toContain('Открытие смены');
  });

  it('creates a checklist from the chosen template and hands it back', async () => {
    const created = { id: 'new-1', title: 'Оценка консультанта' };
    api.createChecklistFromTemplate.mockResolvedValue(created);
    const { container, onCreated } = await mount();
    const use = container.querySelector<HTMLButtonElement>('li button');
    await act(async () => { use?.click(); });
    expect(api.createChecklistFromTemplate).toHaveBeenCalledWith('consultant-assessment', 'ru');
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it('shows an error and does not hand anything back when creation fails', async () => {
    api.createChecklistFromTemplate.mockRejectedValue(new Error('boom'));
    const { container, onCreated } = await mount();
    await act(async () => { container.querySelector<HTMLButtonElement>('li button')?.click(); });
    expect(onCreated).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
