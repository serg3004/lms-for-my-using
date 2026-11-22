// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

import { BulkArchiveDialog, BulkResultDialog } from './BulkDialogs.js';
import { BulkUserBar } from './BulkUserBar.js';

Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  close(this: HTMLDialogElement) { this.removeAttribute('open'); },
});

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
});

async function mount(element: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(element); });
  return host;
}

const impact = { users: 3, observerSessions: 2, soleInstructorCourses: 1, openAssignments: 4, subordinates: 0, managedDepartments: 0 };
const buttons = (host: HTMLElement) => [...host.querySelectorAll('button')].map((button) => button.textContent);

describe('bulk dialogs and bar (PR 497)', () => {
  it('shows the summed impact and confirms archiving; refuses when the impact is unknown', async () => {
    await i18n.changeLanguage('ru');
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const host = await mount(<BulkArchiveDialog error={false} onCancel={onCancel} onConfirm={onConfirm} pending={{ count: 3, impact }} />);
    expect(host.textContent).toContain('Архивировать пользователей: 3?');
    expect(host.textContent).toContain('Незавершённые сессии наблюдения: 2');
    expect(host.textContent).toContain('Курсов, где кто-то из них единственный преподаватель: 1');
    expect(host.textContent).toContain('Открытые назначения курсов: 4');
    await act(async () => { [...host.querySelectorAll('button')].find((button) => button.textContent === 'Архивировать')!.click(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => { root?.render(<BulkArchiveDialog error={false} onCancel={onCancel} onConfirm={onConfirm} pending={{ count: 3, impact: null }} />); });
    await act(async () => { [...host.querySelectorAll('button')].find((button) => button.textContent === 'Архивировать')!.click(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('reports the totals and a reason for everyone who was not touched', async () => {
    await i18n.changeLanguage('ru');
    const report = {
      action: 'suspend' as const, summary: { requested: 4, done: 1, unchanged: 1, failed: 2 },
      items: [
        { userId: 'a', status: 'done' as const }, { userId: 'b', status: 'unchanged' as const },
        { userId: 'c', status: 'conflict' as const, reason: 'self' }, { userId: 'd', status: 'notFound' as const },
      ],
    };
    const host = await mount(<BulkResultDialog names={new Map([['c', 'Иванов Иван']])} onClose={() => undefined} report={report} />);
    expect(host.textContent).toContain('Запрошено: 4. Выполнено: 1. Уже в таком состоянии: 1. Не выполнено: 2.');
    expect(host.textContent).toContain('Иванов Иван: нельзя сделать это с самим собой');
    expect(host.textContent).toContain('d: не найден или вне вашей команды');
    expect(host.textContent).not.toContain('a:');
  });

  it('offers archiving to an administrator only, and selecting everyone matching the filter', async () => {
    await i18n.changeLanguage('en');
    const onAction = vi.fn();
    const onSelectAll = vi.fn();
    const props = { scope: { mode: 'rows' as const, count: 20 }, canSelectAll: true, matching: 45, onAction, onSelectAll, onClear: () => undefined, busy: false };
    const manager = await mount(<BulkUserBar {...props} canArchive={false} />);
    expect(buttons(manager)).toEqual(['Block', 'Unblock', 'Change department', 'Resend invitation', 'Select all 45 users matching the filter', 'Clear selection']);
    await act(async () => { [...manager.querySelectorAll('button')].find((button) => button.textContent === 'Block')!.click(); });
    expect(onAction).toHaveBeenCalledWith('suspend');
    await act(async () => { [...manager.querySelectorAll('button')].find((button) => button.textContent?.startsWith('Select all'))!.click(); });
    expect(onSelectAll).toHaveBeenCalledTimes(1);

    await act(async () => { root?.render(<BulkUserBar {...props} canArchive scope={{ mode: 'filter', count: 45 }} />); });
    expect(buttons(manager)).toContain('Archive');
    expect(manager.textContent).toContain('All 45 users matching the filter are selected.');
  });
});
