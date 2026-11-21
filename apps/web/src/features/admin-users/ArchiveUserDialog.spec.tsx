// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

import { ArchiveUserDialog, type PendingArchive } from './ArchiveUserDialog';
import type { AdminUserSummary } from './model.js';

Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  close(this: HTMLDialogElement) { this.removeAttribute('open'); },
});

const user = { id: 'u1', lastName: 'Ivanov', firstName: 'Ivan', middleName: null, email: 'i@example.test', status: 'active' } as AdminUserSummary;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
});

async function render(pending: PendingArchive | null, error = false, onConfirm = vi.fn(), onCancel = vi.fn()) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(<ArchiveUserDialog error={error} onCancel={onCancel} onConfirm={onConfirm} pending={pending} />); });
  return { host, onConfirm, onCancel };
}

const impact = { observerSessions: 2, soleInstructorCourses: [{ id: 'c1', title: 'Safety' }], openAssignments: 4, subordinates: 0, managedDepartments: 0 };

describe('ArchiveUserDialog (PR 495)', () => {
  it('lists what archiving leaves behind and confirms', async () => {
    await i18n.changeLanguage('ru');
    const { host, onConfirm } = await render({ user, impact });
    expect(host.textContent).toContain('Архивировать Ivanov Ivan?');
    expect(host.textContent).toContain('Незавершённые сессии наблюдения: 2');
    expect(host.textContent).toContain('единственный преподаватель: Safety');
    expect(host.textContent).toContain('Открытые назначения курсов: 4');
    const confirm = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Архивировать')!;
    await act(async () => { confirm.click(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('says nothing is pending when the impact is empty', async () => {
    await i18n.changeLanguage('en');
    const { host } = await render({ user, impact: { ...impact, observerSessions: 0, soleInstructorCourses: [], openAssignments: 0 } });
    expect(host.textContent).toContain('Nothing unfinished is tied to this person.');
  });

  it('does not archive when the impact could not be checked', async () => {
    await i18n.changeLanguage('en');
    const { host, onConfirm, onCancel } = await render({ user, impact: null });
    expect(host.textContent).toContain('Could not check what the archiving affects');
    const confirm = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Archive')!;
    await act(async () => { confirm.click(); });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
