// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from './apiClient.js';

const api = vi.hoisted(() => ({ getVoicePolicy: vi.fn(), saveVoicePolicy: vi.fn() }));
vi.mock('./api/voicePolicy.js', () => api);

import { VoicePolicyCard } from './VoicePolicyCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => { await i18n.changeLanguage('ru'); });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const policy = { dictationEnabled: true, voiceNotesEnabled: false, maxSeconds: 120, perComment: 3, version: 2 };

async function mount() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<VoicePolicyCard organizationId="o1" />));
  await flush();
}
const submit = async () => { await act(async () => (host?.querySelector('button[type=submit]') as HTMLButtonElement).click()); await flush(); };

describe('VoicePolicyCard (PR 511)', () => {
  it('shows dictation on and sound off by default and saves with the version it saw', async () => {
    api.getVoicePolicy.mockResolvedValue(policy);
    api.saveVoicePolicy.mockImplementation(async (_org: string, next: typeof policy) => ({ ...next, version: next.version + 1 }));
    await mount();
    const boxes = [...(host as HTMLDivElement).querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([true, false]);
    expect((host as HTMLDivElement).querySelector<HTMLInputElement>('#voice-max-seconds')?.disabled).toBe(true);
    await act(async () => boxes[1].click());
    await submit();
    expect(api.saveVoicePolicy).toHaveBeenCalledWith('o1', { ...policy, voiceNotesEnabled: true });
    expect((host as HTMLDivElement).textContent).toContain('Сохранено');
  });

  it('says so and offers to reload when someone else changed the settings (409)', async () => {
    api.getVoicePolicy.mockResolvedValue(policy);
    api.saveVoicePolicy.mockRejectedValue(new ApiClientError('conflict', 409));
    await mount();
    await submit();
    expect((host as HTMLDivElement).querySelector('[role=alert]')?.textContent).toContain('изменил кто-то другой');
    api.getVoicePolicy.mockResolvedValue({ ...policy, version: 3 });
    await act(async () => ([...(host as HTMLDivElement).querySelectorAll('button')].find((b) => b.textContent?.includes('актуальные')) as HTMLButtonElement).click());
    await flush();
    expect(api.getVoicePolicy).toHaveBeenCalledTimes(2);
  });

  it('tells that the settings could not be loaded and does not allow saving', async () => {
    api.getVoicePolicy.mockRejectedValue(new Error('down'));
    await mount();
    expect((host as HTMLDivElement).querySelector('[role=alert]')?.textContent).toContain('Не удалось загрузить');
    expect((host as HTMLDivElement).querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true);
  });
});
