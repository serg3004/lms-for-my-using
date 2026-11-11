import { expect, type Page, type Route } from '@playwright/test';

// PR 467: the guest side of a checklist link, `/c/:token`, against a small in-memory copy of the public API.
export const PUBLIC_TOKEN = 'k3Jf9QxLw2Zp7VbN4mTa8RcYd6HsUe0G';
export const GOOD_CODE = 'K7M2P';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="56" viewBox="0 0 160 56"><rect width="160" height="56" fill="#f4f4f5"/><text x="12" y="40" font-size="34" font-family="monospace" fill="#18181b">K7M2P</text></svg>';

type Mode = 'everyone' | 'registered' | 'off';
export type PublicPageOptions = { mode?: Mode; guestNameRequired?: boolean; guestPhotosAllowed?: boolean; photoRequiredCount?: number; title?: string };
export type PublicPageLog = { starts: Array<Record<string, unknown>>; finishes: Array<Record<string, unknown>>; answers: Array<{ itemId: string; body: Record<string, unknown>; passKey: string | undefined }>; captchas: number };

const error = (status: number, code: string, message: string, details?: Array<{ code: string; message: string }>) => ({ statusCode: status, error: { code, message, ...(details ? { details } : {}) }, path: '/', timestamp: '2026-11-11T00:00:00.000Z' });

export async function mockPublicChecklist(page: Page, options: PublicPageOptions = {}) {
  const mode: Mode = options.mode ?? 'everyone';
  const title = options.title ?? 'Приёмка 5S';
  const log: PublicPageLog = { starts: [], finishes: [], answers: [], captchas: 0 };
  const items = [
    { id: 'it1', text: 'Проходы свободны' },
    { id: 'it2', text: 'Инструмент на своих местах' },
  ].map((item, index) => ({ ...item, checklistId: 'sheet', order: index + 1, points: 1, isRequired: true, photoRequired: false, weight: 1 }));
  let status = 'in_progress';
  let started = false;
  const results: Array<Record<string, unknown>> = [];

  const instance = () => {
    const earned = results.filter((r) => r.checked).length;
    return {
      id: 'pass-1', organizationId: 'org', checklistId: 'sheet', userId: 'guest', assignedBy: 'guest', status, totalScore: status === 'completed' ? earned : null, maxScore: items.length,
      percentage: status === 'completed' ? Math.round((earned / items.length) * 100) : null, passed: status === 'completed' ? earned === items.length : null, dueAt: null, submittedAt: null,
      completedAt: status === 'completed' ? '2026-11-11T10:00:00.000Z' : null, createdAt: '2026-11-11T09:00:00.000Z', updatedAt: '2026-11-11T09:00:00.000Z', results,
      checklist: {
        id: 'sheet', organizationId: 'org', title, description: null, status: 'published', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false, showPointsToLearner: true,
        createdBy: null, createdAt: '2026-11-11T09:00:00.000Z', updatedAt: '2026-11-11T09:00:00.000Z', itemGroups: [], items,
      },
    };
  };

  const answer = async (route: Route) => route.fulfill({ json: instance() });

  await page.route('**/api/v1/public/checklists/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1/public/checklists/', '');
    const [token, ...rest] = path.split('/');
    const tail = rest.join('/');
    if (token !== PUBLIC_TOKEN || mode === 'off') return route.fulfill({ status: 404, json: error(404, 'NOT_FOUND', 'This link is not valid') });
    if (mode === 'registered') return route.fulfill({ status: 401, json: error(401, 'UNAUTHORIZED', 'Sign in to open this checklist', [{ code: 'LOGIN_REQUIRED', message: `/c/${PUBLIC_TOKEN}` }]) });
    if (request.method() === 'GET' && tail === '') {
      return route.fulfill({ json: { title, description: null, criteriaCount: items.length, photoRequiredCount: options.photoRequiredCount ?? 0, guestNameRequired: options.guestNameRequired ?? true, guestPhotosAllowed: options.guestPhotosAllowed ?? false, audience: 'everyone' } });
    }
    if (tail === 'captcha') {
      log.captchas += 1;
      return route.fulfill({ json: { challenge: `challenge-${log.captchas}`, svg: SVG, expiresAt: '2026-11-11T12:00:00.000Z' } });
    }
    if (tail === 'start') {
      const body = request.postDataJSON() as Record<string, unknown>;
      log.starts.push(body);
      if (body.captchaCode !== GOOD_CODE) return route.fulfill({ status: 400, json: error(400, 'BAD_REQUEST', 'The code is wrong', [{ code: 'CAPTCHA_INVALID', message: 'invalid' }]) });
      started = true;
      return route.fulfill({ json: { instanceId: 'pass-1', passKey: 'pass-key-1', instance: instance() } });
    }
    if (!started || request.headers()['x-guest-pass'] !== 'pass-key-1') return route.fulfill({ status: 404, json: error(404, 'NOT_FOUND', 'This pass was not found') });
    if (request.method() === 'GET' && tail === 'passes/pass-1') return route.fulfill({ json: instance() });
    const item = /^passes\/pass-1\/items\/([^/]+)$/.exec(tail);
    if (request.method() === 'PATCH' && item) {
      const body = request.postDataJSON() as Record<string, unknown>;
      log.answers.push({ itemId: item[1]!, body, passKey: request.headers()['x-guest-pass'] });
      const existing = results.findIndex((r) => r.itemId === item[1]);
      const next = { id: `r-${item[1]}`, itemId: item[1], checked: body.checked === true, scaleLevel: null, points: body.checked === true ? 1 : 0, photoUrl: null, photoFileName: null, comment: (body.comment as string | undefined) ?? null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null, answerState: 'answered' };
      if (existing >= 0) results[existing] = next; else results.push(next);
      return answer(route);
    }
    if (request.method() === 'POST' && tail === 'passes/pass-1/finish') {
      const body = request.postDataJSON() as Record<string, unknown>;
      log.finishes.push(body);
      if (body.captchaCode !== GOOD_CODE) return route.fulfill({ status: 400, json: error(400, 'BAD_REQUEST', 'The code is wrong', [{ code: 'CAPTCHA_INVALID', message: 'invalid' }]) });
      status = 'completed';
      return answer(route);
    }
    return route.fulfill({ status: 404, json: error(404, 'NOT_FOUND', 'Not found') });
  });
  return log;
}

/** The language is what the guest chose before; a test of the phone's own language leaves it out. */
export async function openPublicPage(page: Page, options: PublicPageOptions & { language?: string | null } = {}) {
  const language = options.language === undefined ? 'ru' : options.language;
  if (language) await page.addInitScript((value) => window.localStorage.setItem('lms-prototype-language', value), language);
  const log = await mockPublicChecklist(page, options);
  await page.goto(`/c/${PUBLIC_TOKEN}`);
  return log;
}

export async function expectNoHorizontalScroll(page: Page) {
  const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
}
