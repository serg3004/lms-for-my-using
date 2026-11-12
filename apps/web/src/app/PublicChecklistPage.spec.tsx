// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

const api = vi.hoisted(() => ({
  openPublicChecklist: vi.fn(),
  getPublicCaptcha: vi.fn(),
  startPublicChecklist: vi.fn(),
  startPublicChecklistSignedIn: vi.fn(),
  getPublicPass: vi.fn(),
  submitPublicItem: vi.fn(),
  attachPublicPhoto: vi.fn(),
  finishPublicChecklist: vi.fn(),
}));
const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('../shared/api/checklistPublic.js', () => api);
vi.mock('../shared/api/auth.js', () => auth);
vi.mock('./LearnerChecklistSessions.js', () => ({ LearnerChecklistSessions: () => null }));
vi.mock('./ObserverSessionsBlock.js', () => ({ ObserverSessionsBlock: () => null }));

import { ApiClientError } from '../shared/apiClient.js';
import { PublicChecklistPage, publicErrorText } from './PublicChecklistPage';

const TOKEN = 'A'.repeat(32);
const front = (patch: Record<string, unknown> = {}) => ({ title: 'Приёмка 5S', description: null, criteriaCount: 1, photoRequiredCount: 0, guestNameRequired: true, guestPhotosAllowed: false, audience: 'everyone', ...patch });
const captcha = (challenge = 'c1') => ({ challenge, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>', expiresAt: '2026-11-11T12:00:00.000Z' });
const instance = (status = 'in_progress') => ({
  id: 'inst-1', organizationId: 'o', checklistId: 'c', userId: 'g', assignedBy: 'g', status, totalScore: null, maxScore: 1, percentage: null, passed: null, dueAt: null,
  submittedAt: null, completedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', results: [],
  checklist: {
    id: 'c', organizationId: 'o', title: 'Приёмка 5S', description: null, status: 'published', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false, showPointsToLearner: false,
    createdBy: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', itemGroups: [],
    items: [{ id: 'it1', checklistId: 'c', order: 1, text: 'Проходы свободны', points: 1, isRequired: true, photoRequired: false, weight: 1 }],
  },
});

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
let loginState: unknown;
let where = '';

function Probe() {
  const location = useLocation();
  where = location.pathname + location.search;
  loginState = location.state;
  return null;
}

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[`/c/${TOKEN}`]}>
        <Probe />
        <Routes>
          <Route path="/c/:token" element={<PublicChecklistPage />} />
          <Route path="/login" element={<p>Страница входа</p>} />
          <Route path="/learn/checklists" element={<p>Мои листы</p>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}
const byText = (selector: string, text: string) => [...container.querySelectorAll(selector)].find((node) => node.textContent === text) as HTMLElement | undefined;
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(async () => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
  await i18n.changeLanguage('ru');
  window.localStorage.clear();
  window.localStorage.setItem('lms-prototype-language', 'ru');
  api.getPublicCaptcha.mockResolvedValue(captcha());
  auth.getCurrentUser.mockRejectedValue(new ApiClientError('Unauthorized', 401));
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('PublicChecklistPage (PR 467)', () => {
  it('shows the front page with the name field, the code and no app menu', async () => {
    api.openPublicChecklist.mockResolvedValue(front());
    await render();
    expect(container.querySelector('h1')?.textContent).toBe('Приёмка 5S');
    expect(container.querySelector('#public-guest-name')).not.toBeNull();
    expect(container.querySelector('#public-start-captcha')).not.toBeNull();
    expect(container.querySelector('nav')).toBeNull();
    expect(container.textContent).toContain('Критериев: 1');
  });

  it('asks for the name when it is required and for the code, then starts with the code it was given', async () => {
    api.openPublicChecklist.mockResolvedValue(front());
    api.startPublicChecklist.mockResolvedValue({ instanceId: 'inst-1', passKey: 'key-1', instance: instance() });
    await render();

    await act(async () => { byText('button', 'Начать')?.click(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Введите своё имя, чтобы начать.');
    expect(api.startPublicChecklist).not.toHaveBeenCalled();

    await act(async () => { type(container.querySelector('#public-guest-name') as HTMLInputElement, 'Айдос'); });
    await act(async () => { byText('button', 'Начать')?.click(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Введите код с картинки.');

    await act(async () => { type(container.querySelector('#public-start-captcha') as HTMLInputElement, 'K7M2P'); });
    await act(async () => { byText('button', 'Начать')?.click(); });
    expect(api.startPublicChecklist).toHaveBeenCalledWith(TOKEN, { guestName: 'Айдос', captchaChallenge: 'c1', captchaCode: 'K7M2P' });
    expect(container.textContent).toContain('Проходы свободны');
    expect(JSON.parse(window.localStorage.getItem(`lms-public-pass:${TOKEN}`) ?? '{}')).toEqual({ instanceId: 'inst-1', passKey: 'key-1' });
  });

  it('does not ask for a name when it is optional', async () => {
    api.openPublicChecklist.mockResolvedValue(front({ guestNameRequired: false }));
    api.startPublicChecklist.mockResolvedValue({ instanceId: 'inst-1', passKey: 'key-1', instance: instance() });
    await render();
    expect(container.textContent).toContain('Ваше имя (необязательно)');
    await act(async () => { type(container.querySelector('#public-start-captcha') as HTMLInputElement, 'K7M2P'); });
    await act(async () => { byText('button', 'Начать')?.click(); });
    expect(api.startPublicChecklist).toHaveBeenCalledWith(TOKEN, { guestName: undefined, captchaChallenge: 'c1', captchaCode: 'K7M2P' });
  });

  it('explains a wrong code in the page language and asks for a new picture', async () => {
    api.openPublicChecklist.mockResolvedValue(front({ guestNameRequired: false }));
    api.startPublicChecklist.mockRejectedValue(new ApiClientError('The code is wrong', 400, { statusCode: 400, error: { code: 'BAD_REQUEST', message: 'The code is wrong', details: [{ code: 'CAPTCHA_INVALID', message: 'invalid' }] }, path: '/', timestamp: 't' }));
    await render();
    await act(async () => { type(container.querySelector('#public-start-captcha') as HTMLInputElement, 'XXXXX'); });
    api.getPublicCaptcha.mockResolvedValue(captcha('c2'));
    await act(async () => { byText('button', 'Начать')?.click(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Код неверный. Введите символы с новой картинки.');
    expect(api.getPublicCaptcha).toHaveBeenCalledTimes(2);
    expect((container.querySelector('#public-start-captcha') as HTMLInputElement).value).toBe('');
  });

  it('says so before starting when the sheet needs photos but guests may not attach them', async () => {
    api.openPublicChecklist.mockResolvedValue(front({ photoRequiredCount: 2, guestPhotosAllowed: false }));
    await render();
    expect(container.textContent).toContain('владелец не разрешил фото для гостей');
    expect((byText('button', 'Начать') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows one clear page for a link that does not work', async () => {
    api.openPublicChecklist.mockRejectedValue(new ApiClientError('This link is not valid', 404));
    await render();
    expect(container.textContent).toContain('Эта ссылка не работает');
    expect(container.querySelector('#public-guest-name')).toBeNull();
  });

  it('sends a person who is not signed in to the sign-in page and remembers the way back', async () => {
    api.openPublicChecklist.mockRejectedValue(new ApiClientError('Sign in', 401, { statusCode: 401, error: { code: 'UNAUTHORIZED', message: 'Sign in', details: [{ code: 'LOGIN_REQUIRED', message: `/c/${TOKEN}` }] }, path: '/', timestamp: 't' }));
    await render();
    expect(where).toBe('/login');
    expect(loginState).toEqual({ from: { pathname: `/c/${TOKEN}` } });
    expect(container.textContent).toContain('Страница входа');
  });

  it('lets a signed-in employee continue under their own account when only registered people are admitted', async () => {
    api.openPublicChecklist.mockRejectedValue(new ApiClientError('Sign in', 401, { statusCode: 401, error: { code: 'UNAUTHORIZED', message: 'Sign in', details: [{ code: 'LOGIN_REQUIRED', message: `/c/${TOKEN}` }] }, path: '/', timestamp: 't' }));
    auth.getCurrentUser.mockResolvedValue({ id: 'u1' });
    api.startPublicChecklistSignedIn.mockResolvedValue({ id: 'inst-9' });
    await render();
    expect(api.startPublicChecklistSignedIn).toHaveBeenCalledWith(TOKEN);
    expect(where).toBe('/learn/checklists?open=inst-9');
  });

  it('offers the employee sign-in on the front page of an open link', async () => {
    api.openPublicChecklist.mockResolvedValue(front());
    await render();
    await act(async () => { byText('button', 'Войти и пройти как сотрудник')?.click(); });
    expect(where).toBe('/login');
    expect(loginState).toEqual({ from: { pathname: `/c/${TOKEN}` } });
  });

  it('resumes a stored pass after a reload and saves an answer through the guest API', async () => {
    window.localStorage.setItem(`lms-public-pass:${TOKEN}`, JSON.stringify({ instanceId: 'inst-1', passKey: 'key-1' }));
    api.openPublicChecklist.mockResolvedValue(front());
    api.getPublicPass.mockResolvedValue(instance());
    api.submitPublicItem.mockResolvedValue(instance());
    await render();
    expect(api.getPublicPass).toHaveBeenCalledWith(TOKEN, 'inst-1', 'key-1');
    expect(container.textContent).toContain('Проходы свободны');
    expect(container.textContent).not.toContain('Все чек-листы');
    const yes = [...container.querySelectorAll('input[type="radio"]')].find((node) => node.closest('label')?.textContent?.startsWith('Да')) as HTMLInputElement | undefined;
    expect(yes).toBeTruthy();
    await act(async () => { yes?.click(); });
    expect(api.submitPublicItem).toHaveBeenCalledWith(TOKEN, 'inst-1', 'it1', 'key-1', expect.objectContaining({ checked: true }));
  });

  it('drops a stored pass the server no longer knows and shows the front page', async () => {
    window.localStorage.setItem(`lms-public-pass:${TOKEN}`, JSON.stringify({ instanceId: 'inst-1', passKey: 'old' }));
    api.openPublicChecklist.mockResolvedValue(front());
    api.getPublicPass.mockRejectedValue(new ApiClientError('This pass was not found', 404));
    await render();
    expect(container.querySelector('#public-guest-name')).not.toBeNull();
    expect(window.localStorage.getItem(`lms-public-pass:${TOKEN}`)).toBeNull();
  });

  it('thanks the guest after sending and lets them pass again', async () => {
    window.localStorage.setItem(`lms-public-pass:${TOKEN}`, JSON.stringify({ instanceId: 'inst-1', passKey: 'key-1' }));
    api.openPublicChecklist.mockResolvedValue(front());
    api.getPublicPass.mockResolvedValue({ ...instance('completed'), percentage: 100, passed: true, totalScore: 1 });
    await render();
    expect(container.textContent).toContain('Спасибо!');
    await act(async () => { byText('button', 'Пройти ещё раз')?.click(); });
    expect(window.localStorage.getItem(`lms-public-pass:${TOKEN}`)).toBeNull();
    expect(container.querySelector('#public-guest-name')).not.toBeNull();
  });

  it('asks for the code before sending the answers and says what is wrong', async () => {
    window.localStorage.setItem(`lms-public-pass:${TOKEN}`, JSON.stringify({ instanceId: 'inst-1', passKey: 'key-1' }));
    api.openPublicChecklist.mockResolvedValue(front());
    api.getPublicPass.mockResolvedValue({ ...instance(), results: [{ id: 'r1', itemId: 'it1', checked: true, scaleLevel: null, points: 1, answerState: 'answered', photoFileName: null, comment: null, reviewStatus: 'pending' }] });
    await render();
    expect(container.querySelector('#public-finish-captcha')).not.toBeNull();
    const finish = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Завершить проверку') as HTMLButtonElement;
    expect(finish).toBeTruthy();
    await act(async () => { finish.click(); });
    const confirm = [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Завершить проверку').pop() as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    expect(api.finishPublicChecklist).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Введите код с картинки.');
  });
});

describe('publicErrorText', () => {
  const t = ((key: string, fallback: string) => `${key}|${fallback}`) as never;
  const detail = (code: string, status: number) => new ApiClientError('x', status, { statusCode: status, error: { code: 'BAD_REQUEST', message: 'x', details: [{ code, message: 'm' }] }, path: '/', timestamp: 't' });
  it('maps the guest-facing failures to their own texts', () => {
    expect(publicErrorText(new TypeError('Failed to fetch'), t)).toContain('publicChecklist.networkError');
    expect(publicErrorText(new ApiClientError('Request timed out', 408), t)).toContain('publicChecklist.networkError');
    expect(publicErrorText(detail('CAPTCHA_INVALID', 400), t)).toContain('publicChecklist.captchaWrong');
    expect(publicErrorText(detail('CAPTCHA_EXPIRED', 400), t)).toContain('publicChecklist.captchaExpired');
    expect(publicErrorText(detail('DAILY_LIMIT', 429), t)).toContain('publicChecklist.dailyLimit');
    expect(publicErrorText(new ApiClientError('Too many', 429), t)).toContain('publicChecklist.tooMany');
    expect(publicErrorText(new ApiClientError('Photos are not allowed', 403), t)).toContain('publicChecklist.photosForbidden');
  });
});
