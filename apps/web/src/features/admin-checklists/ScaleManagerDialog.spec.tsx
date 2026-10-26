// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

const api = vi.hoisted(() => ({
  listChecklistScales: vi.fn(),
  createChecklistScale: vi.fn(),
  updateChecklistScale: vi.fn(),
  copyChecklistScale: vi.fn(),
  archiveChecklistScale: vi.fn(),
  deleteChecklistScale: vi.fn(),
}));
vi.mock('../../shared/api/checklists.js', () => api);

import { ScaleManagerDialog } from './ScaleManagerDialog';

Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  close(this: HTMLDialogElement) { this.removeAttribute('open'); },
});

const scale = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  organizationId: 'o1',
  name: 'Quality',
  status: 'active',
  inUse: false,
  isDefault: false,
  levels: [{ value: 1, label: 'Low', score: 0 }, { value: 2, label: 'High', score: 100 }],
  ...overrides,
});

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

async function mount(props: { startCreating?: boolean; onSaved?: (s: unknown) => void } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onChanged = vi.fn();
  const onClose = vi.fn();
  await act(async () => {
    root?.render(<ScaleManagerDialog open onChanged={onChanged} onClose={onClose} t={i18n.t.bind(i18n)} {...props} />);
  });
  return { container, onChanged, onClose };
}

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const byText = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(text));
const byLabel = (container: HTMLElement, label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

describe('ScaleManagerDialog level editor (PR 343)', () => {
  it('creates a scale from the editor with the typed name, levels and points', async () => {
    api.listChecklistScales.mockResolvedValue([]);
    const saved = scale({ id: 'new', name: 'Yes/No' });
    api.createChecklistScale.mockResolvedValue(saved);
    const onSaved = vi.fn();
    const { container, onChanged } = await mount({ startCreating: true, onSaved });

    await act(async () => {
      setValue(container.querySelector<HTMLInputElement>('input:not([aria-label])') as HTMLInputElement, 'Yes/No');
      setValue(byLabel(container, 'Название уровня 1') as HTMLInputElement, 'No');
      setValue(byLabel(container, 'Название уровня 2') as HTMLInputElement, 'Yes');
    });
    await act(async () => { byText(container, 'Создать')?.click(); });

    expect(api.createChecklistScale).toHaveBeenCalledWith({
      name: 'Yes/No',
      levels: [{ value: 1, label: 'No', score: 0 }, { value: 2, label: 'Yes', score: 100 }],
    });
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(onChanged).toHaveBeenCalled();
  });

  it('does not call the API and shows the reason when the draft is invalid', async () => {
    api.listChecklistScales.mockResolvedValue([]);
    const { container } = await mount({ startCreating: true });

    await act(async () => { byText(container, 'Создать')?.click(); });

    expect(api.createChecklistScale).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('название шкалы');
  });

  it('adds and removes levels but never goes below two', async () => {
    api.listChecklistScales.mockResolvedValue([]);
    const { container } = await mount({ startCreating: true });

    await act(async () => { byText(container, 'Добавить уровень')?.click(); });
    expect(byLabel(container, 'Название уровня 3')).not.toBeNull();
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="Удалить уровень 3"]')?.click(); });
    expect(byLabel(container, 'Название уровня 3')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Удалить уровень 1"]')?.disabled).toBe(true);
  });

  it('edits an unused scale and sends the whole level set in one update', async () => {
    api.listChecklistScales.mockResolvedValue([scale()]);
    api.updateChecklistScale.mockResolvedValue(scale({ name: 'Quality 2' }));
    const { container } = await mount();

    await act(async () => { byText(container, 'Изменить')?.click(); });
    await act(async () => { setValue(byLabel(container, 'Баллы уровня 2') as HTMLInputElement, '90'); });
    await act(async () => { byText(container, 'Сохранить')?.click(); });

    expect(api.updateChecklistScale).toHaveBeenCalledWith('s1', {
      name: 'Quality',
      levels: [{ value: 1, label: 'Low', score: 0 }, { value: 2, label: 'High', score: 90 }],
    });
  });

  it('shows an in-use scale read-only and makes an editable copy instead of saving it', async () => {
    api.listChecklistScales.mockResolvedValue([scale({ inUse: true })]);
    api.copyChecklistScale.mockResolvedValue(scale({ id: 's2', name: 'Quality (копия)' }));
    const { container } = await mount();

    expect(container.textContent).toContain('Используется');
    await act(async () => { byText(container, 'Просмотр')?.click(); });
    expect(byLabel(container, 'Название уровня 1')?.disabled).toBe(true);
    expect(byText(container, 'Сохранить')).toBeUndefined();

    await act(async () => { byText(container, 'Сделать копию')?.click(); });

    expect(api.copyChecklistScale).toHaveBeenCalledWith('s1', 'Quality (копия)');
    expect(api.updateChecklistScale).not.toHaveBeenCalled();
    expect(byLabel(container, 'Название уровня 1')?.disabled).toBe(false);
  });
});

describe('ScaleManagerDialog default scale (PR 344)', () => {
  it('shows the default scale locked, view-only, without archive or delete, and lets it be copied', async () => {
    api.listChecklistScales.mockResolvedValue([scale({ id: 'd1', name: 'Да/Нет', isDefault: true })]);
    api.copyChecklistScale.mockResolvedValue(scale({ id: 's2', name: 'Да/Нет (копия)' }));
    const { container } = await mount();

    expect(container.textContent).toContain('🔒');
    expect(container.textContent).toContain('По умолчанию');
    const rowButtons = [...container.querySelectorAll<HTMLButtonElement>('li button')].map((b) => b.textContent);
    expect(rowButtons).toEqual(['Просмотр']);

    await act(async () => { byText(container, 'Просмотр')?.click(); });
    expect(container.textContent).toContain('шкала по умолчанию');
    expect(byLabel(container, 'Название уровня 1')?.disabled).toBe(true);
    expect(byText(container, 'Сохранить')).toBeUndefined();

    await act(async () => { byText(container, 'Сделать копию')?.click(); });
    expect(api.copyChecklistScale).toHaveBeenCalledWith('d1', 'Да/Нет (копия)');
    expect(byLabel(container, 'Название уровня 1')?.disabled).toBe(false);
  });
});
