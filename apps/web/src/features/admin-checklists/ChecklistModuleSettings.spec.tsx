// @vitest-environment jsdom
import '../../i18n/index.js';
import i18n from 'i18next';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistGeolocationPolicy, ChecklistModuleSettings } from '../../shared/api/types.js';

const mocks = vi.hoisted(() => ({ getSettings: vi.fn() }));
vi.mock('../../shared/api/checklists.js', () => ({ getChecklistWorkplaceSettings: mocks.getSettings }));
vi.mock('../../shared/api/users.js', () => ({ listUsers: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }) }));

import { ChecklistModuleSettingsBlock, NO_MODULE_OVERRIDES, countModuleOverrides } from './ChecklistModuleSettings.js';

const org = {
  organizationId: 'o', moduleEnabled: true, highPerformanceThreshold: 80, lowThreshold: 40, resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' },
  defaultGeolocationPolicy: 'optional', feedbackVisibility: 'after_completion', observerEligibility: 'selected_roles', observerRoles: ['admin'], observerUserIds: [], updatedAt: null,
};
const THRESHOLDS = 'Пороги результата: как в организации';
const FEEDBACK = 'Видимость обратной связи: как в организации';
const OBSERVERS = 'Кто может быть наблюдателем: как в организации';
const RESET_ALL = 'Сбросить всё: как в организации';

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let latest: { value: ChecklistModuleSettings; policy: string };
const t = i18n.t.bind(i18n);

function Harness({ initial = NO_MODULE_OVERRIDES, location = '', canEditObservers = true }: { initial?: ChecklistModuleSettings; location?: ChecklistGeolocationPolicy | ''; canEditObservers?: boolean }) {
  const [value, setValue] = useState(initial);
  const [policy, setPolicy] = useState(location);
  latest = { value, policy };
  return <ChecklistModuleSettingsBlock canEditObservers={canEditObservers} disabled={false} locationPolicy={policy} onChange={setValue} onResetLocation={() => setPolicy('')} t={t} value={value} />;
}
async function render(props: Parameters<typeof Harness>[0] = {}) {
  await act(async () => root.render(<Harness {...props} />));
}
const checkbox = (label: string) => Array.from(host.querySelectorAll('label')).find((node) => node.textContent?.includes(label))!.querySelector('input')!;
const button = (label: string) => Array.from(host.querySelectorAll('button')).find((node) => node.textContent === label)!;

beforeEach(async () => {
  await i18n.changeLanguage('ru');
  mocks.getSettings.mockResolvedValue({ ...org });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe('ChecklistModuleSettingsBlock (PR 397)', () => {
  it('inherits everything by default and shows what the organization has now', async () => {
    await render();
    expect(host.textContent).toContain('Сейчас в организации: 80% / 40%');
    for (const label of [THRESHOLDS, FEEDBACK, OBSERVERS]) expect(checkbox(label).checked).toBe(true);
    expect(host.textContent).not.toContain(RESET_ALL);
  });

  it('switching a group off pre-fills it from the organization, switching it on returns to inheritance', async () => {
    await render();
    await act(async () => checkbox(THRESHOLDS).click());
    expect(latest.value.thresholds).toEqual({ high: 80, low: 40 });
    const low = host.querySelector('input[type="number"][max="100"]:last-of-type') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(low, '90'); low.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Порог низкого результата должен быть ниже');
    await act(async () => checkbox(FEEDBACK).click());
    expect(latest.value.feedbackVisibility).toBe('after_completion');
    await act(async () => checkbox(THRESHOLDS).click());
    expect(latest.value.thresholds).toBeNull();
  });

  it('"Reset all" returns every group and the sheet geolocation to the organization', async () => {
    await render({ initial: { thresholds: { high: 70, low: 20 }, resultColors: null, feedbackVisibility: 'live', observers: null }, location: 'required' });
    await act(async () => button(RESET_ALL).click());
    expect(latest).toEqual({ value: NO_MODULE_OVERRIDES, policy: '' });
  });

  it('only an administrator changes who may observe; others see the reason and keep the stored value', async () => {
    const stored = { eligibility: 'any_user' as const, roles: [], userIds: [] };
    await render({ canEditObservers: false, initial: { ...NO_MODULE_OVERRIDES, observers: stored } });
    expect(host.textContent).toContain('Список наблюдателей листа меняет только администратор.');
    expect(checkbox(OBSERVERS).disabled).toBe(true);
    await act(async () => checkbox(THRESHOLDS).click());
    await act(async () => button(RESET_ALL).click());
    expect(latest.value.observers).toEqual(stored);
    expect(latest.value.thresholds).toBeNull();
  });

  it('counts the overridden groups, geolocation included', () => {
    expect(countModuleOverrides(NO_MODULE_OVERRIDES, '')).toBe(0);
    expect(countModuleOverrides({ ...NO_MODULE_OVERRIDES, feedbackVisibility: 'live' }, 'off')).toBe(2);
  });
});
