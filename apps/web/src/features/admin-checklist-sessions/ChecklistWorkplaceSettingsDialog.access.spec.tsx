// @vitest-environment jsdom
import '../../i18n/index.js';
import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChecklistWorkplaceSettingsDialog } from './ChecklistWorkplaceSettingsDialog.js';

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), roles: ['instructor'] as string[] }));
vi.mock('../../shared/api/checklists.js', () => ({ getChecklistWorkplaceSettings: mocks.get, updateChecklistWorkplaceSettings: mocks.update }));
vi.mock('../../shared/api/users.js', () => ({ listUsers: vi.fn() }));
vi.mock('../../shared/session.js', () => ({ useOptionalSession: () => ({ currentUser: { roles: mocks.roles } }) }));
const original = {
  organizationId: 'org', moduleEnabled: true, highPerformanceThreshold: 90, lowThreshold: null, resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' }, defaultGeolocationPolicy: 'off', feedbackVisibility: 'after_completion', updatedAt: null,
  observerEligibility: 'selected_roles', observerRoles: ['instructor', 'manager', 'admin'], observerUserIds: [],
};
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const t = i18n.t.bind(i18n);
beforeEach(async () => {
  await i18n.changeLanguage('en');
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }, close(this: HTMLDialogElement) { this.removeAttribute('open'); },
  });
  mocks.get.mockResolvedValue({ ...original });
  mocks.update.mockImplementation(async (payload) => ({ ...original, ...payload }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.clearAllMocks();
});
async function render() {
  await act(async () => root.render(<ChecklistWorkplaceSettingsDialog open onClose={vi.fn()} t={t} />));
}

describe('access settings of the section dialog (PR 365)', () => {
  it('shows the observer rule read-only to a non-admin and leaves it out of the saved payload', async () => {
    mocks.roles = ['instructor'];
    await render();
    expect(host.textContent).toContain('Only an administrator can change who may be an observer.');
    expect(host.querySelector('fieldset select')).toBeNull();
    const save = Array.from(host.querySelectorAll('button')).find((node) => node.textContent === 'Save')!;
    await act(async () => save.click());
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const payload = mocks.update.mock.calls[0]![0];
    expect(payload).not.toHaveProperty('observerEligibility');
    expect(payload).not.toHaveProperty('observerRoles');
    expect(payload).not.toHaveProperty('observerUserIds');
    expect(payload).toMatchObject({ highPerformanceThreshold: 90 });
  });

  it('lets an admin edit it and sends it', async () => {
    mocks.roles = ['admin'];
    await render();
    expect(host.querySelector('fieldset select')).not.toBeNull();
    const save = Array.from(host.querySelectorAll('button')).find((node) => node.textContent === 'Save')!;
    await act(async () => save.click());
    expect(mocks.update.mock.calls[0]![0]).toMatchObject({ observerEligibility: 'selected_roles' });
  });
});
